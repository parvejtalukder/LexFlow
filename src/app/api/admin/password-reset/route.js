import { NextResponse } from 'next/server';
import admin from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { COLLECTIONS, getCollection } from '@/lib/collections';

/**
 * Generate a password-reset link for a user, for the case where someone is
 * locked out and cannot receive the usual reset email.
 *
 * The link is only *generated* — nothing is emailed and no password is changed —
 * so the admin can pass it on through whatever channel is appropriate. The
 * link is short-lived and single-use, exactly like the emailed one.
 */
export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const uid = String(body?.uid || '').trim();
    if (!uid) {
      return NextResponse.json({ error: 'uid is required.' }, { status: 400 });
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json({ error: 'The requested user was not found.' }, { status: 404 });
    }
    if (!target.email) {
      return NextResponse.json(
        { error: 'That account has no email address on file.' },
        { status: 400 }
      );
    }

    // The continue URL sends the user back into this app once the new password
    // is saved. It has to be an Authorized domain in Firebase Auth, exactly like
    // the emailed reset link. NEXT_PUBLIC_SERVER_URL is the same value the
    // browser uses, so dev and production each continue to the right place.
    const actionCodeSettings = {
      url: `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/`,
      handleCodeInApp: false,
    };

    const link = await admin.auth().generatePasswordResetLink(target.email, actionCodeSettings);

    await writeAudit({
      action: 'PASSWORD_RESET_LINK_GENERATED',
      actorUid: actor.uid,
      targetUid: uid,
      email: target.email,
    });

    return NextResponse.json({ success: true, email: target.email, link });
  } catch (error) {
    console.error('Admin Password Reset Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate a reset link for that account.' },
      { status: 500 }
    );
  }
}
