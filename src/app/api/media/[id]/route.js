import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCollection } from '@/lib/collections';
import { requireAuth } from '@/lib/auth';
import { deleteFromGridFS, readFromGridFS } from '@/lib/media';

const REMOTE_TIMEOUT_MS = 15000;

const EXTENSION_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

async function findFile(id) {
  const filesCollection = await getCollection('files');
  try {
    return await filesCollection.findOne({ _id: new ObjectId(id) });
  } catch {
    return null;
  }
}

/**
 * Documents uploaded before the GridFS media library was introduced only keep a
 * remote `fileUrl` (legacy VPS / storage bucket) instead of a `fileId`.
 */
function remoteFileUrl(file) {
  const url = typeof file?.fileUrl === 'string' ? file.fileUrl.trim() : '';
  return /^https?:\/\//i.test(url) ? url : '';
}

function guessMimeType(file, remoteContentType) {
  if (remoteContentType) return remoteContentType.split(';')[0].trim();
  if (file?.mimeType) return file.mimeType;

  const extension = String(file?.fileName || '').split('.').pop().toLowerCase();
  return EXTENSION_MIME_TYPES[extension] || 'application/octet-stream';
}

/** Fetch legacy bytes from their remote URL so they can be streamed back. */
async function readRemoteFile(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Remote file responded with status ${response.status}`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Serve a file's bytes after verifying the caller is allowed to view it. */
export async function GET(request, { params }) {
  const { id } = await params;

  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const file = await findFile(id);
  if (!file) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  const usersCollection = await getCollection('users');
  const dbUser = await usersCollection.findOne({ uid: user.uid });
  const isAdmin = dbUser?.role === 'admin';

  const isOwner = file.ownerUid === user.uid;

  // Owners can always access their own files; admins can access any file.
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const remoteUrl = remoteFileUrl(file);
  const hasGridFSBytes = Boolean(file.fileId);

  if (!hasGridFSBytes && !remoteUrl) {
    return NextResponse.json(
      { error: 'This file has no stored content (missing file bytes and file URL).' },
      { status: 404 }
    );
  }

  try {
    let buffer = null;
    let contentType = null;

    if (hasGridFSBytes) {
      try {
        buffer = await readFromGridFS(file.fileId.toString());
        contentType = guessMimeType(file);
      } catch (gridError) {
        // Bytes can be missing for deduplicated/legacy records — fall back to the
        // remote URL below when one exists.
        console.error('GridFS read error:', gridError);
        if (!remoteUrl) throw gridError;
      }
    }

    if (!buffer) {
      const remote = await readRemoteFile(remoteUrl);
      buffer = remote.buffer;
      contentType = guessMimeType(file, remote.contentType);
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="${file.fileName || 'file'}"`,
      },
    });
  } catch (error) {
    console.error('Media read error:', error);
    return NextResponse.json(
      { error: 'File bytes are unavailable.' },
      { status: 404 }
    );
  }
}

/** Delete a file (owner only). Underlying bytes are removed only if unreferenced. */
export async function DELETE(request, { params }) {
  const { id } = await params;

  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const file = await findFile(id);
  if (!file) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  if (file.ownerUid !== user.uid) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  // A file can only be deleted when it is not in use: not submitted/attached to
  // an application or case, and not referenced as someone's profile photo.
  const usersCollection = await getCollection('users');
  const usedAsPhoto = await usersCollection.findOne({
    photoURL: `/api/media/${id}`,
  });

  if (file.associatedType != null || usedAsPhoto) {
    return NextResponse.json(
      { error: 'This file is in use and cannot be deleted.' },
      { status: 409 }
    );
  }

  const filesCollection = await getCollection('files');

  // Only delete the raw bytes when no other metadata doc points at them.
  // Legacy records keep no GridFS id, so they have no bytes to delete here.
  if (file.fileId) {
    const references = await filesCollection.countDocuments({ fileId: file.fileId });
    if (references <= 1) {
      await deleteFromGridFS(file.fileId.toString());
    }
  }

  await filesCollection.deleteOne({ _id: file._id });

  return NextResponse.json({ success: true });
}
