/**
 * LexFlow email templates.
 *
 * One small builder rather than a template framework: a branded layout, a
 * label/value block for the relevant facts, an optional button, and a plain-text
 * version generated from the same data so the two can never drift.
 *
 * CONFIDENTIALITY: these emails leave the building. Only put in what the
 * recipient is already allowed to see in the app - no client personal details,
 * no HQ / East London figures to caseworkers, no internal notes.
 */

const BRAND = {
  navy: '#080B1A',
  gold: '#C5A059',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  panel: '#f9fafb',
};

// Where the buttons inside emails point. EMAIL_APP_URL exists for emails only:
// the app's NEXT_PUBLIC_SERVER_URL also drives the axios base URL and the
// password-reset link builder, so it must not be repurposed here.
const APP_URL = (process.env.EMAIL_APP_URL || process.env.NEXT_PUBLIC_SERVER_URL || '').replace(
  /\/+$/,
  ''
);

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

/**
 * The full URL for a button, or null when linking would do more harm than good.
 *
 * A localhost or plain-http address is broken for the recipient and is one of
 * the strongest spam signals a filter can see, so an unusable base produces no
 * link at all rather than a bad one.
 */
export function linkableAppUrl(path = '/') {
  if (!/^https:\/\//i.test(APP_URL)) return null;
  try {
    const { hostname } = new URL(APP_URL);
    if (!hostname || LOCAL_HOSTS.includes(hostname.toLowerCase())) return null;
    return `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return null;
  }
}

/** Dates in the firm's timezone, not raw ISO. */
export function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMoney(value) {
  if (value == null || value === '') return '';
  return `£${Number(value).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build one email.
 *
 * @param {{ heading: string, intro?: string, rows?: Array<{label: string, value: any}>,
 *           outro?: string, cta?: { label: string, path: string } }} input
 * @returns {{ html: string, text: string }}
 */
export function renderEmail({ heading, intro, rows = [], outro, cta }) {
  const facts = (rows || []).filter((row) => row && row.value != null && row.value !== '');

  const factsHtml = facts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;border-collapse:collapse;">
        ${facts
          .map(
            (row) => `<tr>
              <td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};font-size:13px;color:${BRAND.muted};">${escapeHtml(
                row.label
              )}</td>
              <td style="padding:8px 0;border-bottom:1px solid ${BRAND.border};font-size:13px;font-weight:600;color:${BRAND.text};text-align:right;">${escapeHtml(
                row.value
              )}</td>
            </tr>`
          )
          .join('')}
      </table>`
    : '';

  // A call to action is only a link when the base URL is usable; otherwise the
  // same label is shown as plain text, so nothing broken or spammy is ever sent.
  const ctaHref = cta ? linkableAppUrl(cta.path) : null;
  const ctaHtml = cta
    ? ctaHref
      ? `<div style="margin:24px 0 0;">
        <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:${BRAND.navy};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(
          cta.label
        )}</a>
      </div>`
      : `<div style="margin:24px 0 0;">
        <span style="display:inline-block;background:${BRAND.navy};color:#ffffff;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(
          cta.label
        )}</span>
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.panel};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.panel};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.navy};padding:18px 24px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">LexFlow</span>
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.gold};margin-left:8px;">Emtiaj &amp; Co</span>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 24px 28px;font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:0;font-size:18px;line-height:1.35;color:${BRAND.text};">${escapeHtml(
                heading
              )}</h1>
              ${intro ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${BRAND.text};">${escapeHtml(intro)}</p>` : ''}
              ${factsHtml}
              ${ctaHtml}
              ${outro ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(outro)}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:${BRAND.panel};border-top:1px solid ${BRAND.border};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:${BRAND.muted};">
              Automated notification from LexFlow — Emtiaj &amp; Co.<br />
              This message concerns a confidential legal matter and is intended only for the
              recipient. If it reached you in error, please delete it and let us know.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'LexFlow — Emtiaj & Co',
    '',
    heading,
    intro ? `\n${intro}` : '',
    facts.length
      ? `\n${facts.map((row) => `${row.label}: ${row.value}`).join('\n')}`
      : '',
    ctaHref ? `\n${cta.label}: ${ctaHref}` : cta ? `\n${cta.label} (sign in to LexFlow)` : '',
    outro ? `\n${outro}` : '',
    '',
    'Automated notification from LexFlow — Emtiaj & Co.',
    'This message concerns a confidential legal matter and is intended only for the recipient.',
  ]
    .filter((part) => part !== '')
    .join('\n');

  return { html, text };
}
