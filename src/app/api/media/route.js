import { NextResponse } from 'next/server';
import { getCollection } from '@/lib/collections';
import { requireAuth } from '@/lib/auth';
import { hashBuffer, normalizeFileName, uploadToGridFS } from '@/lib/media';

const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_DOC_SIZE = 3 * 1024 * 1024; // 3 MB

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function serializeFile(file) {
  return {
    id: file._id.toString(),
    fileId: file.fileId?.toString?.() || file.fileId || null,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    hash: file.hash,
    ownerUid: file.ownerUid,
    category: file.category || null,
    associatedType: file.associatedType || null,
    associatedId: file.associatedId?.toString?.() || null,
    createdAt: file.createdAt,
    url: `/api/media/${file._id.toString()}`,
  };
}

/** List files visible to the caller (access-controlled). */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const usersCollection = await getCollection('users');
  const filesCollection = await getCollection('files');

  const dbUser = await usersCollection.findOne({ uid: user.uid });
  const isAdmin = dbUser?.role === 'admin';

  // Admins can see every file; everyone else sees only their own uploads.
  const query = isAdmin ? {} : { ownerUid: user.uid };

  const files = await filesCollection
    .find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json({
    success: true,
    isAdmin,
    files: files.map(serializeFile),
  });
}

/** Upload a new file (deduplicated by content hash) into the media library. */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const formData = await request.formData();
  const file = formData.get('file');

  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: JPG, PNG, WebP, PDF, DOC, DOCX.' },
      { status: 400 }
    );
  }

  const isDocument =
    file.type.includes('pdf') || file.type.includes('word');
  const sizeLimit = isDocument ? MAX_DOC_SIZE : MAX_IMAGE_SIZE;

  if (file.size > sizeLimit) {
    return NextResponse.json(
      { error: `File size exceeds the ${isDocument ? '3 MB' : '1 MB'} limit.` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = hashBuffer(buffer);

  const filesCollection = await getCollection('files');

  // Deduplication: identical bytes are stored in GridFS only once. A new
  // metadata document is still created for this owner so ownership/access is
  // preserved, but it reuses the same underlying file id.
  let fileId = null;
  let duplicate = false;
  const existing = await filesCollection.findOne({ hash });
  if (existing?.fileId) {
    fileId = existing.fileId;
    duplicate = true;
  } else {
    fileId = await uploadToGridFS(buffer, file.name, file.type);
  }

  const doc = {
    fileId,
    fileName: normalizeFileName(file.name),
    mimeType: file.type,
    sizeBytes: file.size,
    hash,
    ownerUid: user.uid,
    uploadedBy: null,
    associatedType: null,
    associatedId: null,
    category: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await filesCollection.insertOne(doc);

  return NextResponse.json(
    {
      success: true,
      duplicate,
      file: serializeFile({ ...doc, _id: result.insertedId }),
    },
    { status: duplicate ? 200 : 201 }
  );
}
