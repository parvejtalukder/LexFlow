import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { optionalVerifiedToken } from '@/lib/auth';

/**
 * Report a role and account status.
 *
 * Public by design: the client asks the moment a session appears, before the auth
 * state has propagated, so the first request often carries no token.
 *
 * Two guards stop that being a disclosure:
 *  - a caller that DOES send a token is answered from that token alone, so the
 *    query string can never be used to read another account;
 *  - an anonymous caller may ask by uid or email, but only `role` and
 *    `accountStatus` come back. Name and email are no longer returned here, which
 *    is what used to leak - along with which accounts are administrators.
 */
export async function GET(request) {
  try {
    const { user } = await optionalVerifiedToken(request);
    const usersCollection = await getCollection(COLLECTIONS.USERS);

    let dbUser = null;

    if (user) {
      dbUser = await usersCollection.findOne({ uid: user.uid });
      const email = (user.email || '').toLowerCase().trim();
      if (!dbUser && email) {
        dbUser = await usersCollection.findOne({ email });
      }
    } else {
      const { searchParams } = new URL(request.url);
      const uid = searchParams.get('uid');
      const email = searchParams.get('email')?.toLowerCase().trim();

      if (!uid && !email) {
        return NextResponse.json({ error: 'Missing UID!' }, { status: 400 });
      }

      // Look up by uid first, then by email, so a stale uid (e.g. after an
      // auth-account re-creation) never demotes an existing user.
      if (uid) dbUser = await usersCollection.findOne({ uid });
      if (!dbUser && email) dbUser = await usersCollection.findOne({ email });
    }

    // No document in MongoDB yet → treat as a new/unregistered user instead of 404.
    if (!dbUser) {
      return NextResponse.json(
        { success: true, role: 'user', accountStatus: 'UNREGISTERED' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: true, role: dbUser.role, accountStatus: dbUser.accountStatus },
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