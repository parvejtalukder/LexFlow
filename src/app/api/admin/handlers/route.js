import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { ASSIGNABLE_CASEWORKER_STATUS } from '@/lib/cases';

// Returns eligible case handlers for assignment dropdowns.
// Only handlers that may actually receive a case are returned: admins (never
// gated by accountStatus) and caseworkers whose application has been APPROVED
// (accountStatus 'ACTIVE'). Suspended, deactivated, rejected, pending and
// legacy-approved caseworkers all keep `role: 'caseworker'`, so filtering on
// the role alone would offer unworkable accounts for assignment.
export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const handlers = await usersCollection
      .find({
        $or: [
          { role: 'admin' },
          { role: 'caseworker', accountStatus: ASSIGNABLE_CASEWORKER_STATUS },
        ],
      })
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
