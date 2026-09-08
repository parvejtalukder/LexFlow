import { NextResponse } from 'next/server';

const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1 MB limit for images
const MAX_DOC_SIZE = 3 * 1024 * 1024;   // 3 MB limit for documents

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function POST(request) {
  try {
    const incomingFormData = await request.formData();
    const file = incomingFormData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPG, PNG, WebP, PDF, DOC, DOCX.' },
        { status: 400 }
      );
    }

    const isDocument = file.type.includes('pdf') || file.type.includes('word');
    const sizeLimit = isDocument ? MAX_DOC_SIZE : MAX_IMAGE_SIZE;

    if (file.size > sizeLimit) {
      return NextResponse.json(
        { error: `File size exceeds the ${isDocument ? '3 MB' : '1 MB'} limit.` },
        { status: 400 }
      );
    }

    // Convert file stream into a raw Node Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create a server-safe Blob payload with explicit filename and mime type
    const serverBlob = new Blob([buffer], { type: file.type });
    const outgoingFormData = new FormData();
    outgoingFormData.append('file', serverBlob, file.name || 'document');

    // Forward to remote VPS with 10s timeout signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const vpsResponse = await fetch('http://72.61.17.107/uploads/upload.php', {
      method: 'POST',
      body: outgoingFormData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawText = await vpsResponse.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('--- VPS NON-JSON OUTPUT ---');
      console.error(rawText);
      console.error('---------------------------');
      return NextResponse.json(
        { error: 'Invalid response from storage server.' },
        { status: 502 }
      );
    }

    if (!vpsResponse.ok) {
      return NextResponse.json(
        { error: data.error || 'VPS upload failed.' },
        { status: vpsResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: data.imageUrl,
    });
  } catch (error) {
    console.error('--- UPLOAD ROUTE EXCEPTION ---');
    console.error(error);
    console.error('--------------------------------');

    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Upload request to VPS timed out.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Bridge upload failed.' },
      { status: 500 }
    );
  }
}