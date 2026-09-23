import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { optionalVerifiedToken } from '@/lib/auth';

/**
 * Create the MongoDB record for a Firebase account.
 *
 * Public by design, because it is called the moment someone signs up (including
 * with Google) and the browser's auth state has not propagated yet, so that
 * request usually carries no token at all.
 *
 * Identity is therefore proved against Firebase itself rather than by trusting
 * the body: the uid must belong to a real Firebase account, and that account's
 * email is authoritative. A forged uid/email pair can no longer create a record,
 * which is what the earlier unverified version allowed.
 */
export async function POST(request) {
  try {
    const auth = await optionalVerifiedToken(request);

    const body = await request.json().catch(() => ({}));
    const { uid, fullName, photoURL } = body || {};

    // A supplied token wins over the body, so a signed-in caller can only ever
    // register their own account.
    const claimedUid = auth.user?.uid || uid;

    if (!claimedUid) {
      return NextResponse.json(
        { error: 'Missing mandatory fields: uid, email, and fullName are required.' },
        { status: 400 }
      );
    }

    const account = await admin
      .auth()
      .getUser(claimedUid)
      .catch(() => null);

    if (!account) {
      return NextResponse.json(
        { error: 'This account does not exist. Please sign up again.' },
        { status: 403 }
      );
    }

    if (account.disabled) {
      return NextResponse.json(
        { error: 'This account has been disabled.' },
        { status: 403 }
      );
    }

    const email = (account.email || '').toLowerCase().trim();
    const name = String(fullName || account.displayName || '').trim();

    if (!email || !name) {
      return NextResponse.json(
        { error: 'Missing mandatory fields: uid, email, and fullName are required.' },
        { status: 400 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);

    const existingUser = await usersCollection.findOne({
      $or: [{ uid: claimedUid }, { email }],
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: true,
          message: 'User profile with this UID or Email already exists.',
          insertedId: existingUser._id,
        },
        { status: 200 }
      );
    }

    const newUserDoc = {
      uid: claimedUid,
      fullName: name,
      photoURL: photoURL || account.photoURL || null,
      email,
      address: '',
      phone: '',
      jobTitle: '',
      registrationNumber: '',
      staffId: '',
      role: 'user',
      accountStatus: 'PENDING',
      joiningDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUserDoc);

    return NextResponse.json(
      {
        success: true,
        insertedId: result.insertedId,
        message: 'Application registered successfully. Pending Admin review.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Sign-Up API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to create user record on the server.' },
      { status: 500 }
    );
  }
}
