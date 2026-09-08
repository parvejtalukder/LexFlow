import crypto from 'crypto';
import { GridFSBucket, ObjectId } from 'mongodb';
import clientPromise from '@/lib/mongodb';

const DB_NAME = 'lawapp';
const MEDIA_BUCKET = 'media';

export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function normalizeFileName(name, fallback = 'file') {
  const cleaned = String(name || '')
    .replace(/[^\w.\- ]+/g, '_')
    .trim();
  return cleaned || fallback;
}

async function getDb() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

async function getBucket() {
  const db = await getDb();
  return new GridFSBucket(db, { bucketName: MEDIA_BUCKET });
}

/** Store a buffer in GridFS and return the new file ObjectId. */
export async function uploadToGridFS(buffer, fileName, mimeType) {
  const bucket = await getBucket();
  const id = new ObjectId();

  const uploadStream = bucket.openUploadStreamWithId(
    id,
    normalizeFileName(fileName),
    { contentType: mimeType || 'application/octet-stream' }
  );

  await new Promise((resolve, reject) => {
    uploadStream.once('error', reject);
    uploadStream.once('finish', resolve);
    uploadStream.end(buffer);
  });

  return id;
}

/** Read a whole GridFS file into a Buffer (files are capped at a few MB). */
export async function readFromGridFS(fileId) {
  const bucket = await getBucket();
  const id = new ObjectId(fileId);

  const chunks = [];
  await new Promise((resolve, reject) => {
    const stream = bucket.openDownloadStream(id);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });

  return Buffer.concat(chunks);
}

/** Delete the underlying GridFS bytes (ignored if the file no longer exists). */
export async function deleteFromGridFS(fileId) {
  const bucket = await getBucket();
  try {
    await bucket.delete(new ObjectId(fileId));
  } catch (error) {
    // File already gone — safe to ignore.
    if (error?.code !== 'FILE_NOT_FOUND') throw error;
  }
}
