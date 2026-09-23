import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireApplicantAccess } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

/**
 * Fields a user may change on their own record.
 *
 * Everything else on the document - role, accountStatus, email, practice,
 * handlerParcentage / hqParcentage / elParcentage, joiningDate and the approval
 * stamps - is managed by an administrator and is deliberately absent from this
 * list, so a profile edit can never change access, pay rates or approval state.
 */
const SELF_EDITABLE = [
  'fullName',
  'phone',
  'address',
  'jobTitle',
  'registrationNumber',
  'photoURL',
];

const MAX_LENGTH = {
  fullName: 120,
  phone: 40,
  address: 240,
  jobTitle: 120,
  registrationNumber: 60,
  photoURL: 500,
};

function serializeProfile(dbUser) {
  return {
    id: dbUser._id.toString(),
    uid: dbUser.uid,
    fullName: dbUser.fullName,
    email: dbUser.email,
    photoURL: dbUser.photoURL || null,
    phone: dbUser.phone || null,
    address: dbUser.address || null,
    jobTitle: dbUser.jobTitle || null,
    registrationNumber: dbUser.registrationNumber || null,
    staffId: dbUser.staffId || null,
    role: dbUser.role,
    accountStatus: dbUser.accountStatus,
    practiceName: dbUser.practiceName || null,
    handlerParcentage: dbUser.handlerParcentage ?? null,
    hqParcentage: dbUser.hqParcentage ?? null,
    elParcentage: dbUser.elParcentage ?? null,
    joiningDate: dbUser.joiningDate || null,
    approvedAt: dbUser.approvedAt || null,
    createdAt: dbUser.createdAt || null,
    updatedAt: dbUser.updatedAt || null,
  };
}

export async function GET(request) {
  const auth = await requireApplicantAccess(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const dbUser = await usersCollection.findOne({ uid: user.uid });

    if (!dbUser) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, profile: serializeProfile(dbUser) });
  } catch (error) {
    console.error('My Profile API Error:', error);
    return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
  }
}

/**
 * Update your own profile.
 *
 * The record is located by `user.uid` from the verified Firebase token and
 * nothing else: the request body cannot carry a uid, so editing another
 * person's profile is not merely refused, it is unreachable. Admins editing
 * someone else go through /api/admin/*, which is gated by requireAdmin.
 */
export async function PATCH(request) {
  const auth = await requireApplicantAccess(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const update = {};

    for (const field of SELF_EDITABLE) {
      if (!(field in (body || {}))) continue;
      const value = String(body[field] ?? '').trim();
      if (value.length > MAX_LENGTH[field]) {
        return NextResponse.json(
          { error: `${field} must be ${MAX_LENGTH[field]} characters or fewer.` },
          { status: 400 }
        );
      }
      update[field] = value;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No editable fields were supplied.' }, { status: 400 });
    }
    if ('fullName' in update && !update.fullName) {
      return NextResponse.json({ error: 'Full name cannot be empty.' }, { status: 400 });
    }

    update.updatedAt = new Date();

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const result = await usersCollection.updateOne({ uid: user.uid }, { $set: update });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    await writeAudit({
      action: 'PROFILE_UPDATED',
      actorUid: user.uid,
      // Which fields changed, never what they were changed to.
      fields: Object.keys(update).filter((key) => key !== 'updatedAt'),
    });

    const dbUser = await usersCollection.findOne({ uid: user.uid });
    return NextResponse.json({ success: true, profile: serializeProfile(dbUser) });
  } catch (error) {
    console.error('My Profile PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update your profile.' }, { status: 500 });
  }
}

