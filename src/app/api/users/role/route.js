import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireVerifiedToken } from '@/lib/auth';

/**
 * Report the caller's own role and account status.
 *
 * Identity comes from the verified Firebase token, never from the query string:
 * this route used to answer for any `uid` - or any `email` - without a token,
 * which disclosed roles, full names and addresses to anyone, including which
 * accounts are administrators.
 *
 * Verification is deliberately the status-tolerant kind. This route is how the
 * client discovers that an account has been DEACTIVATED, so it must keep
 * answering for that account before the client signs it out.
 */
export async function GET(request) {
  try {
    const auth = await requireVerifiedToken(request);
    if (auth.error) return auth.error;
    const { user } = auth;

    const usersCollection = await getCollection(COLLECTIONS.USERS);

    // Look up by the token's uid first, then its email, so a stale uid (e.g.
    // after an auth-account re-creation) never demotes an existing user.
    let dbUser = await usersCollection.findOne({ uid: user.uid });
    const email = (user.email || '').toLowerCase().trim();
    if (!dbUser && email) {
      dbUser = await usersCollection.findOne({ email });
    }

    // No document in MongoDB yet → treat as a new/unregistered user instead of 404.
    if (!dbUser) {
      return NextResponse.json(
        {
          success: true,
          role: 'user',
          accountStatus: 'UNREGISTERED',
          fullName: null,
          email: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        role: dbUser.role,
        accountStatus: dbUser.accountStatus,
        fullName: dbUser.fullName || null,
        email: dbUser.email || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Fetch Role API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user record on the server.' },
      { status: 500 }
    );
  }
}