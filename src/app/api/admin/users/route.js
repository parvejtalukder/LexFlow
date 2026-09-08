import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    // Users tab: everyone except active/suspended caseworkers (those live in the
    // dedicated Caseworkers tab).
    const users = await usersCollection
      .find({
        $or: [
          { role: { $ne: 'caseworker' } },
          { accountStatus: { $nin: ['ACTIVE', 'SUSPENDED'] } },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u._id.toString(),
        uid: u.uid,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        accountStatus: u.accountStatus,
        phone: u.phone || null,
        jobTitle: u.jobTitle || null,
        registrationNumber: u.registrationNumber || null,
        photoURL: u.photoURL || null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Admin Users API Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve users.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { uid, accountStatus } = body;
    if (!uid || !accountStatus) {
      return NextResponse.json({ error: 'Missing uid or accountStatus.' }, { status: 400 });
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json({ error: 'The requested user was not found.' }, { status: 404 });
    }

    await usersCollection.updateOne({ uid }, { $set: { accountStatus, updatedAt: new Date() } });
    await writeAudit({ action: 'USER_STATUS_UPDATED', actorUid: actor.uid, targetUid: uid, accountStatus });

    return NextResponse.json({ success: true, message: 'User updated successfully.' });
  } catch (error) {
    console.error('Admin Users PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { uid } = body;
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid.' }, { status: 400 });
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json({ error: 'The requested user was not found.' }, { status: 404 });
    }

    // Soft-delete (deactivate) so historical data is preserved.
    await usersCollection.updateOne({ uid }, { $set: { accountStatus: 'DEACTIVATED', updatedAt: new Date() } });
    await writeAudit({ action: 'USER_DEACTIVATED', actorUid: actor.uid, targetUid: uid });

    return NextResponse.json({ success: true, message: 'User deactivated successfully.' });
  } catch (error) {
    console.error('Admin Users DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to deactivate user.' }, { status: 500 });
  }
}
