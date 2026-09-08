import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { getCollection } from '@/lib/collections';

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
 * Extract and verify the `Authorization: Bearer <token>` header from a request.
 *
 * @returns {{ user: object } | { error: NextResponse }}
 */
export async function requireAuth(request) {
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
 * Verify the Firebase token AND require the caller to be an admin.
 * @returns {{ user: object, dbUser: object } | { error: NextResponse }}
 */
export async function requireAdmin(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth;

  const { user } = auth;
  const usersCollection = await getCollection('users');
  const dbUser = await usersCollection.findOne({ uid: user.uid });

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
