import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import admin from '@/lib/firebaseAdmin';

/**
 * The roles the application actually uses. There is no superuser tier: `admin`
 * is the highest level, and an administrator grants it to somebody else.
 */
const ASSIGNABLE_ROLES = ['admin', 'caseworker', 'applicant', 'user'];

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    // Full directory: admins, applicants and caseworkers — including accepted
    // (ACTIVE/APPROVED) and suspended caseworkers, so an accepted caseworker can
    // always be found from this list. The Caseworkers tab
    // (/api/admin/caseworkers) adds practice and commission management on top.
    const users = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();

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

/**
 * Update a user's role and/or account status.
 * Body: { uid, role?, accountStatus? } - at least one of the two.
 *
 * An admin may make anybody an admin, and may remove admin from anybody else.
 * The one thing an admin cannot do is change his own role: he must ask another
 * administrator. No separate "last admin" rule is needed, and that is not an
 * oversight - the caller is always an admin (requireAdmin) and cannot demote
 * himself, so the only way to reach zero administrators would be for the last
 * one to demote himself, which this check refuses. At least one admin always
 * survives.
 */
export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = (await request.json()) || {};
    const { uid } = body;
    if (!uid) {
      return NextResponse.json({ error: 'uid is required.' }, { status: 400 });
    }

    const hasRole = body.role != null;
    const hasStatus = body.accountStatus != null;
    if (!hasRole && !hasStatus) {
      return NextResponse.json(
        { error: 'Provide a role, an accountStatus, or both.' },
        { status: 400 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json({ error: 'The requested user was not found.' }, { status: 404 });
    }

    const update = { updatedAt: new Date() };
    const changed = [];

    if (hasRole) {
      const role = String(body.role).trim().toLowerCase();
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.` },
          { status: 400 }
        );
      }
      if (uid === actor.uid && role !== target.role) {
        return NextResponse.json(
          { error: 'You cannot change your own role. Ask another administrator.' },
          { status: 400 }
        );
      }
      if (role !== target.role) {
        update.role = role;
        changed.push('role');
      }
    }

    if (hasStatus) {
      const accountStatus = String(body.accountStatus).trim().toUpperCase();
      if (!accountStatus) {
        return NextResponse.json({ error: 'accountStatus cannot be empty.' }, { status: 400 });
      }
      if (accountStatus !== target.accountStatus) {
        update.accountStatus = accountStatus;
        changed.push('accountStatus');
      }
    }

    if (changed.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No changes were needed.',
        user: { uid, role: target.role, accountStatus: target.accountStatus },
      });
    }

    await usersCollection.updateOne({ uid }, { $set: update });

    if (changed.includes('role')) {
      // Keep the Firebase custom claim in step with MongoDB, the way approving an
      // application already does. Authorization is read from MongoDB, so a claims
      // failure can neither grant nor withhold access - it is only logged.
      try {
        await admin.auth().setCustomUserClaims(uid, { role: update.role });
      } catch (claimError) {
        console.error('setCustomUserClaims failed:', claimError);
      }

      await writeAudit({
        action: 'USER_ROLE_UPDATED',
        actorUid: actor.uid,
        targetUid: uid,
        from: target.role,
        to: update.role,
      });
    }

    if (changed.includes('accountStatus')) {
      await writeAudit({
        action: 'USER_STATUS_UPDATED',
        actorUid: actor.uid,
        targetUid: uid,
        accountStatus: update.accountStatus,
      });
    }

    const updated = await usersCollection.findOne({ uid });

    return NextResponse.json({
      success: true,
      message: 'User updated successfully.',
      user: { uid, role: updated.role, accountStatus: updated.accountStatus },
    });
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
