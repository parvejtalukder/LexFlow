# LexFlow — Email Notifications

How transactional email works, how to configure it, how to deploy it, and how to
tell whether it is healthy. Business notifications only — **password reset and
other sign-in email is sent separately by Firebase Authentication** and does not
use anything in this document.

---

## What it does

Notifications are sent by a small server-side layer:

| File | Purpose |
|---|---|
| `src/lib/email/mailer.js` | The only place Nodemailer is imported. One reused Gmail transport. `sendEmail()` never throws. |
| `src/lib/email/templates.js` | One branded template (HTML + matching plain text). Decides whether a button may be a link. |
| `src/lib/email/notifications.js` | The 11 notification functions and the single `deliver()` funnel. |
| `src/app/api/admin/email-test/route.js` | Admin-only health check and test send. |

Ten existing API routes call into it, each **after** its own state change has been
written. No new database collection was created: the audit trail lives in the
existing `auditLogs` collection.

---

## Who is notified, and when

| Event | Sent to | Triggered from |
|---|---|---|
| Application received | applicant + administrators | `PATCH /api/users/application` (first submission only) |
| Application approved / rejected (+reason) | applicant | `PATCH /api/admin/applications` |
| Case waiting for review | administrators | `POST /api/cases` (caseworker-created) |
| Case assigned to you | the handler | `POST /api/cases`, `PATCH /api/cases/[id]` |
| Case reassigned away | previous handler | `PATCH /api/cases/[id]` |
| Case approved / rejected (+reason) | the handler | `POST /api/cases/[id]/review` |
| Payment approved (**recipient's own share only**) | the handler | `PATCH /api/payments/[id]` |
| Approved payment voided (+amount removed) | the handler | `PATCH /api/payments/[id]` |
| Withdrawal requested | administrators | `POST /api/wallet/withdraw` |
| Withdrawal approved / rejected (+reason) / paid (+method, reference) | the caseworker | `PATCH /api/admin/withdrawals` |
| Branch payout recorded / reversed (+reason) | **other** administrators | `POST` / `PATCH /api/admin/company-withdrawals` |
| Complaint filed | administrators | `POST /api/complaints` |

Deliberately **not** emailed: ordinary field edits, page loads, re-reads, and the
submission of a payment for approval (the payments queue is already the
workflow). Case **titles** are never included — only the case number, because
titles often contain the client's name and email leaves the building.

---

## The rules that keep it safe

1. **Only after a committed transition.** The call sits after the database write
   and the audit entry, so a notification can never announce something that did
   not happen.
2. **Never on a read.** Every trigger is in a POST/PATCH handler.
3. **Never to yourself.** An administrator approving a payment on a case they
   handle, a caseworker opening their own case, an admin filing a complaint or
   recording a branch payout — none of them are emailed about their own action.
4. **Never to an out-of-service account.** Administrators carrying
   `DEACTIVATED`, `SUSPENDED` or `REJECTED` are skipped. The legacy `APPROVED`
   status used by admin records is still treated as active (see
   [ACCOUNT_STATUS.md](./ACCOUNT_STATUS.md)).
5. **No email addresses in the body.** Recipients see names, case numbers, dates
   and amounts — never an address. Verified across every message.
6. **Links only when they are worth having.** A button is a link only if
   `EMAIL_APP_URL` is **https on a real host**. A localhost or plain-http value
   renders the same label as plain text instead: a broken link is both useless
   for the reader and a strong spam signal.
7. **It can never break the operation.** `deliver()` catches everything. A mail
   or template failure is logged and recorded, and the API still returns its
   normal success response.
8. **Everything leaves a trace.** Every outcome is written to `auditLogs`:
   `EMAIL_SENT`, `EMAIL_FAILED`, or `EMAIL_SKIPPED` (with a reason such as
   `no-recipient` or `not-configured`). A notification that never went out is
   therefore visible rather than silent.
9. **One message per recipient.** Addresses are never batched into a shared
   `To:` line, so no recipient sees anyone else's address.

---

## Configuration

Six values live in `.env` (which is git-ignored — credentials are never
committed, logged or returned by an API).

| Variable | Required | Purpose |
|---|---|---|
| `GMAIL_USER` | yes | The authenticated Gmail account, and the address mail is sent from. |
| `GMAIL_APP_PASSWORD` | yes | A Google **App Password** (16 characters). Leaving it blank disables sending: nothing is sent, `EMAIL_SKIPPED` is recorded, and the app keeps working. |
| `GMAIL_FROM_NAME` | no | Display name on the From line. Default `LexFlow`. |
| `GMAIL_REPLY_TO` | no | Reply-To address. Blank means no Reply-To header, so replies go to the From address (the notifications mailbox). |
| `EMAIL_APP_URL` | yes for links | Public site used by email buttons, and nothing else. Must be https on a real host. |
| `GMAIL_HOST` / `GMAIL_PORT` | no | SMTP overrides. Default `smtp.gmail.com:465`. |

`EMAIL_APP_URL` is deliberately separate from `NEXT_PUBLIC_SERVER_URL`, because
that variable also drives the app's axios base URL and the password-reset link
builder and must not be repurposed.

### Gmail App Password (not the account password)

1. Google Account → **Security** → turn on **2-Step Verification**.
2. Security → **App passwords** → create one named `LexFlow`.
3. Put the 16 characters in `GMAIL_APP_PASSWORD`.

Deprecated "Less Secure Apps" is **not** used. Sending is capped by Gmail at
roughly 500 recipients/day on a free account (~2,000 on Workspace), which is far
above this app's volume.

---

## Deploying to the VPS

1. **Put the six values in the server's `.env`** — in particular
   `EMAIL_APP_URL=https://dashboard.pcsquaresolicitors.in` and the Gmail keys.
   Without `EMAIL_APP_URL` the app still works; emails simply carry no links.
2. **Build, then (re)start.** `next start` reads `.env` once at startup, so a
   changed value needs a restart, not just a save.
3. **Never build while the server is running.** `next build` rewrites `.next`,
   which a running `next start` serves from — replacing it mid-flight makes
   individual requests fail intermittently around the build. Stop the server,
   build, start it again. (This is what caused a failed-then-successful caseworker
   approval on 23 Sep 2026.)
4. **Verify after deploying** (see below).

---

## Verifying after deploy

As an administrator:

```
GET  /api/admin/email-test          -> { configured: true, from: "…" }
POST /api/admin/email-test          -> sends one sample to the caller
POST /api/admin/email-test { uid }  -> sends one sample to another user
```

The recipient is always resolved from a user record server-side, never taken from
the request body, so this route cannot be used as an open relay. It answers
`403` to a non-admin, `401` unauthenticated, `400` for a user with no address,
`503` when credentials are missing, and `502` when Gmail rejects the send. The
sample email also shows an **"Email links"** row so you can see at a glance
whether link generation is enabled.

A healthy send leaves **no** `[email]` line in the server log — the mailer only
logs failures and skips.

---

## Monitoring

| Signal | Where |
|---|---|
| Delivered / failed / skipped per event, with recipients and failure reasons | `auditLogs` where `action` is `EMAIL_SENT`, `EMAIL_FAILED` or `EMAIL_SKIPPED` |
| Transport failures | server log lines beginning `[email] send failed for …` |
| Skips | `[email] <EVENT>: skipped …` plus an `EMAIL_SKIPPED` audit row |

To answer "did this user get an email about X?", query `auditLogs` by `event` and
`subjectId` — that is the reason the audit trail is written at all.

---

## Known limits (by design or by choice)

- **Deliverability is reputation.** Sending from a free Gmail account to people
  who have never corresponded with it can land in Spam until recipients mark it
  **Not spam**, add the sender to **Contacts**, and reply once. Making the
  sender your own domain (Google Workspace plus SPF/DKIM/DMARC for
  `pcsquaresolicitors.in`) is the durable fix; `mailer.js` is the only file that
  knows about Gmail, so that change is configuration, not a rewrite.
- **No queue and no retry.** A notification is attempted once, at the moment of
  the event. If sending fails, the audit row records it and nothing resends it.
- **No reply address unless configured.** With `GMAIL_REPLY_TO` blank there is no
  Reply-To header; replies go to the notifications mailbox.
- **`requireAdmin` checks `role` only.** `accountStatus` is enforced for the
  dashboard UI, not for the API, so a `DEACTIVATED` admin still holds admin API
  access. Notifications no longer reach them, but the access gap is untouched
  (documented, not fixed).
- **Auth email is not covered.** Password reset and any future verification mail
  are sent by Firebase Authentication, from Firebase's own sender.

---

## What this layer deliberately does not touch

Wallet, withdrawal, VAT and percentage calculations, the frozen
`profitDistributions` snapshots, authorization rules, existing API response
shapes, and the database schema are all unchanged. Emails use the historical
values stored for the event — never a percentage recalculated today. The case
field behind "ASSISTED BY" is still `helperName`.

