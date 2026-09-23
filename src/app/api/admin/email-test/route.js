import { NextResponse } from 'next/server';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { requireAdmin } from '@/lib/auth';
import { emailConfigured, senderAddress, sendEmail } from '@/lib/email/mailer';
import { formatDateTime, linkableAppUrl, renderEmail } from '@/lib/email/templates';

/**
 * Administrator-side check that the Gmail transport works.
 *
 * The recipient is always resolved from a user record on the server, never from
 * the request body, so this endpoint can never be turned into an open relay for
 * an arbitrary address.
 *
 *   GET  -> whether credentials are configured, and which mailbox sends
 *   POST -> { uid? } send one sample message (defaults to the caller)
 */

/** Report the configured sender without ever exposing the password. */
export async function GET(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;

  return NextResponse.json({
    success: true,
    configured: emailConfigured(),
    from: senderAddress() || null,
  });
}

export async function POST(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json().catch(() => ({}));
    const targetUid = body?.uid || actor.uid;

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid: targetUid });
    if (!target) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }
    if (!target.email) {
      return NextResponse.json(
        { error: 'That user has no email address on record.' },
        { status: 400 }
      );
    }

    if (!emailConfigured()) {
      return NextResponse.json(
        {
          success: false,
          configured: false,
          error: 'GMAIL_USER and GMAIL_APP_PASSWORD are not set on the server.',
        },
        { status: 503 }
      );
    }

    const linkBase = linkableAppUrl('/');

    const { html, text } = renderEmail({
      heading: 'LexFlow email notifications are working',
      intro:
        'This is a test message, sent from the LexFlow notifications mailbox. Business notifications will use the same sender and design.',
      rows: [
        // Names only. No email address ever appears in the body of a message.
        { label: 'Sent to', value: target.fullName || 'LexFlow user' },
        { label: 'Sent from', value: 'LexFlow notifications' },
        { label: 'Sent', value: formatDateTime(new Date()) },
        // Worth seeing at a glance, because a dev or plain-http link base is both
        // broken for the recipient and a strong spam signal.
        {
          label: 'Email links',
          value: linkBase ? `enabled (${linkBase})` : 'disabled - no https public URL configured',
        },
      ],
      cta: { label: 'Open LexFlow', path: '/dashboard' },
      outro:
        'Password reset and other sign-in emails are sent separately by Firebase Authentication.',
    });

    const result = await sendEmail({
      to: target.email,
      subject: 'LexFlow — Email notification test',
      html,
      text,
    });

    if (!result.sent) {
      return NextResponse.json(
        { success: false, configured: true, error: result.error || result.reason },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      configured: true,
      from: senderAddress(),
      to: target.email,
      messageId: result.messageId || null,
    });
  } catch (error) {
    console.error('Email test Error:', error);
    return NextResponse.json({ error: 'Failed to send the test email.' }, { status: 500 });
  }
}
