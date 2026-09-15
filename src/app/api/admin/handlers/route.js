import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

// Returns eligible case handlers (admins + caseworkers) for assignment dropdowns.
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const handlers = await usersCollection
      .find({ role: { $in: ['admin', 'caseworker'] } })
      .sort({ fullName: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      handlers: handlers.map((u) => ({
        uid: u.uid,
        fullName: u.fullName,
        role: u.role,
        accountStatus: u.accountStatus,
      })),
    });
  } catch (error) {
    console.error('Handlers GET Error:', error);
    return NextResponse.json({ error: 'Failed to load handlers.' }, { status: 500 });
  }
}
