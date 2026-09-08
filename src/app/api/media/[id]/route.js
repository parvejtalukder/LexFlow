import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getCollection } from '@/lib/collections';
import { requireAuth } from '@/lib/auth';
import { deleteFromGridFS, readFromGridFS } from '@/lib/media';

async function findFile(id) {
  const filesCollection = await getCollection('files');
  try {
    return await filesCollection.findOne({ _id: new ObjectId(id) });
  } catch {
    return null;
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
  const isSubmitted = file.associatedType != null;

  // Owners always can access their own files. Admins may only access files
  // that have been submitted (attached to an application / case).
  if (!isOwner && !(isAdmin && isSubmitted)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  try {
    const buffer = await readFromGridFS(file.fileId.toString());
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': file.mimeType || 'application/octet-stream',
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
  const references = await filesCollection.countDocuments({ fileId: file.fileId });
  if (references <= 1) {
    await deleteFromGridFS(file.fileId.toString());
  }

  await filesCollection.deleteOne({ _id: file._id });

  return NextResponse.json({ success: true });
}
