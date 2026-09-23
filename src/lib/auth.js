import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { COLLECTIONS, getCollection } from '@/lib/collections';

/**
 * Verify a Firebase ID token using the Firebase Admin SDK.
 * Requires the service account configured in src/lib/firebaseAdmin.js
 * (src/lib/lawFirebaseAdmin.json locally, or FIREBASE_* env vars in production).
 *
 * @returns {{ uid: string, email: string|null, displayName: string|null, photoURL: string|null } | null}
 */
export async function verifyFirebaseToken(idToken) {
  if (!idToken) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      displayName: decoded.name || null,
      photoURL: decoded.picture || null,
    };
  } catch (error) {
    console.error('verifyFirebaseToken error:', error);
    return null;
  }
}

/**
 * Account statuses that bar an account from the API.
 *
 * Mirrors `resolveDashboardAccess` (the dashboard gate) and the notification
 * recipient filter, so all three agree on what "not in service" means.
 *
 * `requireApplicantAccess` is the deliberate exception, so that the application
 * lifecycle survives a blanket block here: `REJECTED` is reversible by design
 * (ACCOUNT_STATUS.md: REJECTED -> resubmit -> PENDING), while `SUSPENDED` and
 * `DEACTIVATED` are terminal offboarding states.
 */
export const OUT_OF_SERVICE_STATUSES = ['SUSPENDED', 'DEACTIVATED', 'REJECTED'];

/** Statuses that mean an account has been offboarded for good. */
export const OFFBOARDED_STATUSES = ['SUSPENDED', 'DEACTIVATED'];

/** Is this stored account barred from the API? A missing record is not. */
export function isOutOfService(dbUser) {
  return Boolean(dbUser && OUT_OF_SERVICE_STATUSES.includes(dbUser.accountStatus));
}

/** Is this stored account offboarded? A missing record is not. */
export function isOffboarded(dbUser) {
  return Boolean(dbUser && OFFBOARDED_STATUSES.includes(dbUser.accountStatus));
}

/**
 * Verify the token only - no account-status gate.
 *
 * Deliberately used by the two routes that must keep answering for an account
 * the API is refusing: `/api/users/role` reports a `DEACTIVATED` account so the
 * client can sign it out, and `/api/users/signup` stays idempotent for a record
 * that already exists (which is also why a deactivated user cannot re-register
 * themselves into a fresh, active record).
 *
 * @returns {{ user: object } | { error: NextResponse }}
 */
export async function requireVerifiedToken(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token ? await verifyFirebaseToken(token) : null;

  if (!user) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized: a valid Firebase token is required.' },
        { status: 401 }
      ),
    };
  }

  return { user };
}

/**
 * Verify the token only if one was sent.
 *
 * For the routes that must stay reachable by anyone arriving at the site - a
 * brand-new sign-up in particular, where the browser's auth state has not caught
 * up with the Firebase account yet and the first request therefore carries no
 * token. Callers receive `{ user: null }` instead of a 401 and decide for
 * themselves how to treat an anonymous request.
 *
 * @returns {{ user: object|null }}
 */
export async function optionalVerifiedToken(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { user: null };

  const user = await verifyFirebaseToken(token);
  return { user: user || null };
}

/**
 * Access for the application lifecycle: a verified token that has not been
 * offboarded.
 *
 * A `REJECTED` applicant must still reach the application form — the dashboard
 * routes them there to re-apply — and a `PENDING` one obviously must. A
 * `SUSPENDED` or `DEACTIVATED` account must not, since those states are terminal.
 *
 * @returns {{ user: object, dbUser: object|null } | { error: NextResponse }}
 */
export async function requireApplicantAccess(request) {
  const auth = await requireVerifiedToken(request);
  if (auth.error) return auth;

  const { user } = auth;
  const usersCollection = await getCollection(COLLECTIONS.USERS);
  const dbUser = await usersCollection.findOne({ uid: user.uid });

  if (isOffboarded(dbUser)) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: this account is not active.' },
        { status: 403 }
      ),
    };
  }

  return { user, dbUser };
}

/**
 * Verify the Firebase token AND refuse an out-of-service account.
 *
 * @returns {{ user: object, dbUser: object|null } | { error: NextResponse }}
 */
export async function requireAuth(request) {
  const auth = await requireVerifiedToken(request);
  if (auth.error) return auth;

  const { user } = auth;

  // Checked here rather than in every route. A missing document is allowed: a
  // brand-new sign-up has no record yet, and /api/users/role answers
  // UNREGISTERED for it.
  const usersCollection = await getCollection(COLLECTIONS.USERS);
  const dbUser = await usersCollection.findOne({ uid: user.uid });

  if (isOutOfService(dbUser)) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: this account is not active.' },
        { status: 403 }
      ),
    };
  }

  return { user, dbUser };
}

/**
 * Verify the Firebase token AND require the caller to be an admin.
 * @returns {{ user: object, dbUser: object } | { error: NextResponse }}
 */
export async function requireAdmin(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth;

  const { user, dbUser } = auth;

  if (dbUser?.role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: 'Forbidden: admin access required.' },
        { status: 403 }
      ),
    };
  }

  return { user, dbUser };
}
