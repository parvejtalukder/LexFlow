import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireVerifiedToken } from '@/lib/auth';

/**
 * Create the MongoDB record for a freshly authenticated Firebase account.
 *
 * Called after sign-up or Google sign-in, so the caller always holds a valid ID
 * token - which is the point: identity is taken from that token, never from the
 * request body. This route previously accepted an unauthenticated insert for any
 * uid or email, which allowed junk records and address squatting.
 *
 * Idempotent by design: the Google sign-in path posts on every sign-in, so an
 * existing record (matched by uid or email) is reported rather than duplicated.
 * Because verification here is the status-tolerant kind, that also means a
 * DEACTIVATED account cannot re-register itself into a fresh record.
 */
export async function POST(request) {
  try {
    const auth = await requireVerifiedToken(request);
    if (auth.error) return auth.error;
    const { user: caller } = auth;

    const body = await request.json().catch(() => ({}));
    const { fullName, photoURL } = body || {};

    // Identity from the token; only cosmetic fields come from the body.
    const uid = caller.uid;
    const email = (caller.email || '').toLowerCase().trim();
    const name = String(fullName || caller.displayName || '').trim();

    if (!uid || !email || !name) {
      return NextResponse.json(
        { error: 'Missing mandatory fields: uid, email, and fullName are required.' },
        { status: 400 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);

    const existingUser = await usersCollection.findOne({
      $or: [{ uid }, { email }],
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
      uid,
      fullName: name,
      photoURL: photoURL || caller.photoURL || null,
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
