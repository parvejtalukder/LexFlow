import nodemailer from 'nodemailer';

/**
 * Server-only Gmail SMTP transport.
 *
 * Nodemailer is imported here and nowhere else, and this module is only ever
 * imported by route handlers - so the credentials cannot reach the browser
 * bundle (`next build` inlines NEXT_PUBLIC_* values only, never these).
 *
 * The transporter is created once and reused. Building a new one per email would
 * open a fresh SMTP connection every time, which Gmail throttles quickly.
 *
 * Auth emails (password reset) are deliberately NOT sent from here: Firebase
 * Auth owns those, from its own sender.
 */

const SMTP_HOST = process.env.GMAIL_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.GMAIL_PORT || 465);
const SMTP_USER = process.env.GMAIL_USER;
const SMTP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM_NAME = process.env.GMAIL_FROM_NAME || 'LexFlow';
// Reply-to comes only from GMAIL_REPLY_TO. Deliberately no fallback to
// NEXT_PUBLIC_SUPPORT_EMAIL: that is a person's inbox used by the Help page, and
// it should never be published inside outgoing mail. Left blank, replies simply
// go to the From address - the notifications mailbox.
const REPLY_TO = process.env.GMAIL_REPLY_TO || '';

/** Never let a hanging SMTP socket hold a request open. */
const SEND_TIMEOUT_MS = 5000;

let transporter = null;
let warnedMissingConfig = false;

export function emailConfigured() {
  return Boolean(SMTP_USER && SMTP_PASSWORD);
}

/** The address notifications are sent from, for display/logging. */
export function senderAddress() {
  return SMTP_USER || '';
}

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 is implicit TLS; 587 would be STARTTLS.
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  });

  return transporter;
}

/**
 * Send one email.
 *
 * Never throws: the caller's business operation has already been committed, so a
 * mail problem must only ever be reported, never propagated.
 *
 * @returns {{ sent: boolean, reason?: string, messageId?: string }}
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'no-recipient' };

  if (!emailConfigured()) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn(
        '[email] GMAIL_USER / GMAIL_APP_PASSWORD are not set - notifications will be skipped.'
      );
    }
    return { sent: false, reason: 'not-configured' };
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"${FROM_NAME}" <${SMTP_USER}>`,
      to,
      subject,
      text,
      html,
      // Machine-generated mail, the correct semantics for automated notifications
      // (and it stops out-of-office reply loops between colleagues).
      headers: { 'Auto-Submitted': 'auto-generated' },
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[email] send failed for ${to}:`, error?.message || error);
    return { sent: false, reason: 'send-failed', error: error?.message || String(error) };
  }
}
