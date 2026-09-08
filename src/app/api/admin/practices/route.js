import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

const DEFAULT_PRACTICES = [
  'Criminal Law',
  'Family Law',
  'Immigration Law',
  'Corporate Law',
  'Property Law',
];

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const practicesCollection = await getCollection(COLLECTIONS.PRACTICES);

    // Seed sensible defaults the first time so the approval dialog has options.
    let practices = await practicesCollection.find({}).sort({ name: 1 }).toArray();
    if (practices.length === 0) {
      const now = new Date();
      await practicesCollection.insertMany(
        DEFAULT_PRACTICES.map((name) => ({ name, createdAt: now, updatedAt: now }))
      );
      practices = await practicesCollection.find({}).sort({ name: 1 }).toArray();
    }

    return NextResponse.json({
      success: true,
      practices: practices.map((p) => ({ id: p._id.toString(), name: p.name })),
    });
  } catch (error) {
    console.error('Practices GET Error:', error);
    return NextResponse.json({ error: 'Failed to load practices.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Practice name is required.' }, { status: 400 });
    }

    const practicesCollection = await getCollection(COLLECTIONS.PRACTICES);
    const existing = await practicesCollection.findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existing) {
      return NextResponse.json({ error: 'Practice already exists.' }, { status: 409 });
    }

    const now = new Date();
    const result = await practicesCollection.insertOne({ name, createdAt: now, updatedAt: now });

    return NextResponse.json(
      { success: true, practice: { id: result.insertedId.toString(), name } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Practices POST Error:', error);
    return NextResponse.json({ error: 'Failed to create practice.' }, { status: 500 });
  }
}
