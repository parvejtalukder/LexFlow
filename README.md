# Law Firm Case & Financial Management System

An internal web application that runs a law firm's casework **and** its money in one
place. It covers the whole life of a piece of legal work:

> applicant → approved caseworker → case opened and approved → the client pays in
> terms (optionally VAT-inclusive) → an administrator approves the payment → the net
> amount is split between the case handler and the firm's offices → the handler's
> wallet and the branch balances grow → withdrawals and payouts are requested,
> reviewed and paid → every step is written to an auditable history.

It is one Next.js application (App Router, JavaScript/JSX — no TypeScript). MongoDB is
the system of record, Firebase Authentication is the identity provider, uploaded
documents live in MongoDB GridFS, and transactional email is sent from the server over
SMTP. There is no separate backend service and no ORM: route handlers under
`src/app/api/**` talk to the MongoDB driver through the small modules in `src/lib/`.

The dashboard is **dark-only** — the `dark` class is set on `<html>` in the root
layout, so there is no theme toggle and no light variant to maintain.

## Documentation in this repository

| Document | Covers |
|---|---|
| [`docs/ACCOUNT_STATUS.md`](docs/ACCOUNT_STATUS.md) | The `role` and `accountStatus` values — the single source of truth for both |
| [`docs/EMAIL_NOTIFICATIONS.md`](docs/EMAIL_NOTIFICATIONS.md) | Which emails are sent, to whom, configuration, deployment, monitoring, known limits |
| [`report.md`](report.md) | A point-in-time audit of the repository, kept for history — it describes an earlier state of the build |

## 1. Who uses it

| Actor | How they get here | What they can do |
|---|---|---|
| **Visitor** | Opens the site root | Sign up (email/password or Google), sign in, request a password reset |
| **Registered user** | Signed in, no approved role yet | Nothing but the application form — the dashboard guard sends them there |
| **Applicant** | Submitted the caseworker application | Edit and re-submit that application, upload identification and licence documents |
| **Caseworker** (`ACTIVE`) | Approved by an administrator | Their own cases and review outcomes, the payments they submit, their wallet, their withdrawal requests, their own transaction history and statements, their own complaints |
| **Administrator** | `role: 'admin'` in the database | Everything: applications and the caseworker roster, every case and assignment, the payment approval queue, the profit split and every wallet, branch payouts, withdrawal requests, complaints, the firm-wide activity history and statements |

Role and status decide everything, and they are decided **server-side**. The client-side
guard exists so a person sees a sensible page instead of an empty shell; the API is the
authoritative boundary (see [§5](#5-authorization)).

## 2. What it does

### 2.1 Sign-up, application and the caseworker roster

A new person creates a Firebase account (email/password or Google). The client then
calls `POST /api/users/signup`, which **proves the identity against Firebase Admin**
before writing anything: the `uid` must be a real Firebase account, that account's email
is treated as authoritative, and creating a record is idempotent (a second call returns
the existing one). The new `users` record starts as `role: 'user'`,
`accountStatus: 'PENDING'`.

Submitting the caseworker application (`PATCH /api/users/application`) moves that record
to `role: 'applicant'` and stores the professional details — name, phone, address, job
title, registration number, profile photo — plus an identification document and a
licence document from the media library. Only the applicant themselves may write it, and
an administrator account can never be turned into an applicant. The first submission
notifies the applicant and every administrator; later edits while the application is
pending deliberately do not re-send that email.

An administrator decides the application in `PATCH /api/admin/applications`:

- **Approve** — requires a **practice** (`practiceId`), which is copied onto the user as
  a `practiceName` snapshot for display and historical integrity. The optional
  profit-sharing percentages may be set at the same moment. Result:
  `role: 'caseworker'`, `accountStatus: 'ACTIVE'`.
- **Reject** — with a reason. Result: `accountStatus: 'REJECTED'`, which is reversible:
  the applicant can edit and re-submit, going back to `PENDING`.

The practice itself is a separate, admin-managed concept in its own collection
(`practices`). A practice is **not** a profit-sharing agreement — do not conflate the
two.

Roster administration lives in `PATCH`/`DELETE /api/admin/caseworkers`: **suspend**
(paused, stays on the roster, can be reactivated) and **deactivate** (soft delete — the
record and all of its historical cases, payments and distributions are preserved). Every
one of those transitions rewrites `accountStatus` only, so a suspended or deactivated
caseworker still carries `role: 'caseworker'` in the database. Only an `ACTIVE`
caseworker (or an administrator) is ever offered as a case handler, which is why
`isValidHandler()` in `src/lib/cases.js` checks the status and never the role alone.

### 2.2 Cases

A case (`cases` collection) carries a generated number (`CASE-0001`, …), a title,
category, priority, a free-text description, "assisted by", a **client snapshot** (name,
email, phone, address, date of birth, reference), a deal price and its VAT treatment,
the assigned handler, a status and a **document snapshot** so listings never need a join.

- **Statuses**: `PENDING`, `OPEN`, `IN_PROGRESS`, `CLOSED`, `REJECTED`.
- **Who may open one**: a caseworker may only open a case where they are the handler; an
  administrator may assign any case to any assignable handler.
- **Approval**: a caseworker-created case starts `PENDING` and needs
  `POST /api/cases/[id]/review` (administrator only) to become active. A case created by
  an administrator is active immediately.
- **Documents are mandatory**: at least one media-library document must be attached at
  creation, and the attached files are stamped as case documents so their bytes cannot
  be deleted while in use.
- **VAT at creation**: `isVat` adds 20% of the entered (net) deal price, and the VAT
  amount and VAT-inclusive total are stored on the case — the figure the client is
  expected to pay overall (`calculateDealVat`).
- **Reassignment**: `PATCH /api/cases/[id]` (administrator only) can move a case to
  another handler; the case is re-checked against the handler rules, and the previous
  handler is told it has gone.

### 2.3 Case documents and the media library

Uploads go to `POST /api/media`, are restricted to JPG, PNG, WebP, PDF, DOC and DOCX,
capped at **1 MB for images** and **3 MB for documents**, hashed with SHA-256 and stored
in a GridFS bucket (`media`). Identical bytes are stored once; a second upload creates
its own metadata row (so ownership and access stay correct) but reuses the stored file,
and the endpoint answers `200` rather than `201` to say so.

Bytes are served by `GET /api/media/[id]` only after an access check. `DELETE` is
owner-only and refuses with `409` while a file is in use — attached to an application or a
case, or set as somebody's profile photo — and the stored bytes are removed only when no
other metadata row still points at them. A file's `category` (for example a caseworker's
identification or licence) and `associatedType`/`associatedId` record what it belongs to.
Documents uploaded before the GridFS library existed kept only a remote URL; those are
still fetched and streamed back for compatibility. The dashboard renders PDFs and images
in an in-app viewer rather than handing the file to an external viewer.

### 2.4 Client payments and terms

A case is usually paid in **terms**. Each payment (`payments` collection) records the
amount, term number, reference, description, payment method, received date and who
recorded it.

- Payments can only be submitted for an **active** case — never for one still `PENDING`
  or already `REJECTED`.
- A caseworker may only submit payments for their own case. An administrator may submit
  for any case, and the payment still enters the approval queue.
- The sum of `PENDING` + `APPROVED` payments may never exceed what the client owes (the
  VAT-inclusive total). A term that would push past the remaining balance is refused,
  naming the remaining figure.
- Term numbers run sequentially across payments that have not been rejected or voided.
- A submitted payment is `PENDING` and is **not** money yet: no VAT, no net and no profit
  distribution are calculated until an administrator approves it, so a percentage change
  made before approval stays accurate.

An administrator decides it in `PATCH /api/payments/[id]` with one of three actions:

| Action | Effect |
|---|---|
| `approve` | VAT and net are calculated, a frozen profit distribution is written, the handler's wallet is credited, and the audit entry plus notification are recorded |
| `reject` | Only a pending payment can be rejected; it keeps its rejection reason and can be edited and re-submitted later |
| `void` | Cancels an already approved payment and removes its distribution, so the wallet credit disappears with it |

### 2.5 Profit sharing (in brief)

Approving a payment turns a gross figure into three parts: VAT is separated out, and the
remaining net is split by the handler's configured percentages
(`handlerParcentage` / `hqParcentage` / `elParcentage`) into the handler's share, the
Head Office share and the East London share. The result is written once, frozen, into
`profitDistributions`. [§6](#6-the-money-model) describes the arithmetic and the
rounding rules in full.

### 2.6 Wallets

A wallet balance is **derived, never stored** — it is recomputed from the distributions
and withdrawals every time it is read (`src/lib/wallet.js`), so there is no balance to
drift out of sync:

```
earned       = handler share of every approved payment
withdrawn    = withdrawals that reached PAID
reserved     = withdrawals that are PENDING or APPROVED (requested but not yet paid)
available    = earned − withdrawn
withdrawable = available − reserved
```

Money only leaves a wallet when an administrator marks a withdrawal **PAID**; an
approval merely reserves the amount so it cannot be requested twice. A voided payment
removes its distribution, so the handler's wallet drops with it.

### 2.7 Branch accounts (Head Office / East London)

The firm's own share of each split funds two branch accounts, `HQ` and `EL`
(`computeCompanyBalance`):

```
earned       = the HQ or EL share of every profit distribution
paid         = branch payouts booked as PAID
withdrawable = earned − paid
```

There is no approval step here — only an administrator can move company money, so a
branch payout is recorded directly as paid and simply reduces what is left. A payout
recorded by mistake can be reversed, which puts the amount straight back. Because a
payout may already have left before a payment is voided, a branch `withdrawable` figure
can legitimately go negative, and that is shown rather than hidden.

### 2.8 Withdrawals and payouts

Two different things share one `withdrawals` collection, distinguished by `account`:

| Kind | Requested by | Lifecycle |
|---|---|---|
| **Caseworker withdrawal** (`account: HANDLER`, the default) | The caseworker, from their own wallet | `PENDING` → `APPROVED` → `PAID`, or `PENDING` → `REJECTED` |
| **Branch payout** (`account: HQ` or `EL`) | Nobody — an administrator records it | Recorded straight as `PAID`; reversible afterwards |

A withdrawal request is checked against the caller's **own** computed withdrawable
balance, so nobody can draw more than they earned, and a personal request never touches
branch money. `PATCH /api/admin/withdrawals` carries the three administrator actions
(`approve`, `pay`, `reject`), with the payment method and reference captured when the
money is actually paid.

### 2.9 Activity history and statements

There is no "transactions" collection. The history is a **derived, read-only projection**
over records that already exist (`src/lib/transactions.js`, `src/lib/transactionQuery.js`):

| Source | Row type |
|---|---|
| `profitDistributions` | `EARNED` — money credited to a handler wallet |
| `withdrawals` (`HANDLER`) | `WITHDRAWAL` |
| `withdrawals` (`HQ` / `EL`) | `PAYOUT` |
| `payments` | `PAYMENT` — the gross the client paid, **administrators only** |

Scope follows the role: a caseworker sees their own earnings and withdrawals, an
administrator can see the whole firm. Gross client payments and the HQ/EL figures are
firm-level information and are never part of a personal history. Rows are filterable by
type, status, date range and free text; a bare date used as the upper bound covers that
whole calendar day rather than stopping at midnight, and results are capped so one
request cannot pull an unbounded set.

`GET /api/wallet/statement` returns the complete filtered set for a range (capped at
5 000 rows) so the same payload can produce both the CSV export and the printed PDF
statement, bound by exactly the same permissions.

Everything shown reads the **stored** percentages and amounts on the distribution row —
never the handler's current split — so a later change to someone's percentages cannot
rewrite a historical statement. To avoid double counting, gross client payments are
reported as their own totals and excluded from the wallet totals (the gross already
contains the net that produced the earnings).

The dashboard overview and the money pages are driven by `GET /api/dashboard/stats` and
`GET /api/wallet`, which answer a firm-wide shape for an administrator and a personal
one for a caseworker from the same endpoints, and by the chart components in
`src/components/charts/`.

### 2.10 Complaints

Staff can file a complaint (subject and message, with length limits) against
`POST /api/complaints`. A complaint belongs to the person who filed it: `submittedBy` is
the ownership key and the only thing that permits an edit, so there is no administrator
path to rewrite somebody else's words. Editing while the complaint is still open stamps
`editedAt` and bumps `editCount`, so any reader can see that it changed and when. Once
it is decided (`RESOLVED` / `DISMISSED`) it is locked. Administrators review and can
delete; they cannot edit.

### 2.11 Email notifications

Business email is sent by a small server-side layer (`src/lib/email/`) over SMTP, with 11
notification functions covering 12 events: application received, application approved or
rejected, case waiting for review, case assigned, case reassigned away, case approved or
rejected, payment approved, approved payment voided, withdrawal requested, withdrawal
approved / rejected / paid, branch payout recorded or reversed, and complaint filed.
[`docs/EMAIL_NOTIFICATIONS.md`](docs/EMAIL_NOTIFICATIONS.md) holds the full routing table
and the deployment notes.

The rules that keep it honest:

1. A notification is sent **only after a committed transition** — never for a read, and
   never to announce something that did not happen.
2. **Never to yourself**: nobody is emailed about their own action.
3. **Never to an out-of-service account**: administrators carrying `DEACTIVATED`,
   `SUSPENDED` or `REJECTED` are skipped.
4. **No addresses in the body**, and case *titles* are never included — only the case
   number — because a title often contains the client's name and email leaves the
   building.
5. Link buttons appear only when `EMAIL_APP_URL` is `https` on a real host; a broken link
   is also a spam signal, so a localhost value produces no link at all.
6. No queue and no retry: one attempt at the moment of the event. The outcome is recorded
   in the audit trail either way (`EMAIL_SENT` / `EMAIL_FAILED` / `EMAIL_SKIPPED`).

Password reset and other authentication email are sent by Firebase Authentication
itself, from Firebase's own sender, and never pass through this layer. Administrators can
check the configuration and send a sample with `GET`/`POST /api/admin/email-test`; the
recipient is always resolved from a user record server-side, so that route cannot be used
as an open relay.

### 2.12 Audit trail

Every state change writes an entry to the `auditLogs` collection through
`writeAudit()` — approvals, rejections, suspensions, payments, distributions,
withdrawals, payouts, complaints and email outcomes. The write is fire-and-forget: a
failure to log is reported to the server console but never breaks the operation the user
asked for.

## 3. Architecture

| Concern | Choice | Where |
|---|---|---|
| Framework | Next.js (App Router), React 19, JavaScript/JSX | `src/app/**` pages, `src/app/api/**` route handlers |
| Styling | Tailwind CSS v4 + DaisyUI plugin, shadcn-style tokens | `src/app/globals.css`, `src/templates/main.css`, `src/components/ui/**` |
| Identity | Firebase Authentication (email/password, Google, password reset) | `src/firebase/firebase.config.js`, `src/context/AuthProvider.jsx` |
| Token verification | Firebase Admin SDK — every protected route verifies the Firebase ID token server-side | `src/lib/firebaseAdmin.js`, `src/lib/auth.js` |
| Database | MongoDB through the official driver, one reused connection (cached across hot reloads in development). No ODM | `src/lib/mongodb.js`, `src/lib/collections.js` |
| File storage | GridFS bucket `media`; metadata in the `files` collection | `src/lib/media.js`, `src/app/api/media/**` |
| Email | Nodemailer over SMTP, server-only, one reused transporter | `src/lib/email/**` |
| Charts / exports | recharts; jsPDF + jspdf-autotable for statements | `src/components/charts/**`, `src/lib/statementExport.js` |
| Human check | Google reCAPTCHA, verified server-side and switchable by env flag | `src/lib/recaptcha.js`, `src/app/api/auth/verify-recaptcha/route.js` |
| Client requests | one axios instance that attaches the current ID token and ends the session **only** on `401` | `src/hooks/useAxiosSecure.jsx` |
| Audit | append-only `auditLogs` collection | `src/lib/audit.js` |

Two conventions are worth knowing before changing anything: the `@/` path alias points at
`src/`, and the Firebase Admin credentials come from `FIREBASE_SERVICE_ACCOUNT` (full
JSON), from the individual `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
`FIREBASE_PRIVATE_KEY` fields, or from a local, git-ignored
`src/lib/lawFirebaseAdmin.json` — in that order.

A `403` from this API means "you are signed in, but not allowed", so it must never end a
session; only an invalid or expired token (a `401`) does.

## 4. The account lifecycle

Two fields on the `users` record decide everything. `role` says what somebody is;
`accountStatus` says whether they are currently in service. **Both must be checked** —
every lifecycle action rewrites the status only, so a suspended or deactivated
caseworker still carries `role: 'caseworker'`.

| `role` | Meaning |
|---|---|
| `admin` | Full access to the administrator dashboard and every administrator API |
| `caseworker` | An approved caseworker. Only an `ACTIVE` one may be handed cases |
| `applicant` | Somebody who has an application on file — *not* an approved caseworker |
| `user` | A registered account that has not applied yet |

| `accountStatus` | Applies to | Meaning |
|---|---|---|
| `PENDING` | user / applicant | Application submitted, awaiting review |
| `REJECTED` | applicant | Application rejected — **reversible** by re-submitting |
| `ACTIVE` | caseworker | Approved and able to work |
| `SUSPENDED` | caseworker | Temporarily blocked — **reversible** by reactivating |
| `DEACTIVATED` | user / caseworker | Soft-deleted (offboarded, history preserved) — terminal |
| `APPROVED` | admin | Legacy value still carried by some administrator records; treated as active |
| `UNREGISTERED` | — | Not stored: returned by the role endpoint when no record exists |

```
(user registers)            role=user,       status=PENDING
      │  submits application
      ▼
(application on file)       role=applicant,  status=PENDING
      ├─ admin approves  ──▶ role=caseworker, status=ACTIVE   + practice, + split percentages
      └─ admin rejects   ──▶ role=applicant,  status=REJECTED ── resubmit ──▶ PENDING
                                    │
              ┌─────────────────────┼─────────────────────┐
        suspend                     │                 deactivate
              ▼                     │                     ▼
        status=SUSPENDED ── reactivate ──▶ ACTIVE      status=DEACTIVATED (terminal)
```

`SUSPENDED` and `DEACTIVATED` are deliberately **not** the same state: suspension means
"pause access for now" and keeps the person on the roster, while deactivation is
offboarding that keeps the history but is not undone — the person would be re-onboarded
or re-apply instead. [`docs/ACCOUNT_STATUS.md`](docs/ACCOUNT_STATUS.md) is the single
source of truth for both fields and for exactly where each rule is enforced; do not
introduce a new status or role string without updating it.

## 5. Authorization

### 5.1 Server-side guards

Every protected route handler begins by calling one of five helpers in `src/lib/auth.js`.
There is no middleware and no protected route decides *who* the caller is from the request
body: identity always comes from a verified Firebase ID token, and where a body does carry
a `uid` it is only ever compared against that token (the one legacy exception is flagged in
[§11](#11-known-limits-and-deliberate-choices)).

| Helper | What it enforces | Used by |
|---|---|---|
| `requireAdmin` | A valid token **and** `role: 'admin'` | every `/api/admin/**` route, payment decisions, case review, case edit/delete |
| `requireAuth` | A valid token, refusing `SUSPENDED`, `DEACTIVATED` and `REJECTED` with `403`. A missing user record is allowed, because a brand-new sign-up has none yet | cases, payments (submit/list), wallet, media, complaints, dashboard stats, support contact |
| `requireApplicantAccess` | A valid token, refusing `SUSPENDED` and `DEACTIVATED` but **deliberately allowing `REJECTED`**, so a rejected applicant can still re-apply | `PATCH /api/users/application`, `/api/users/me` |
| `requireVerifiedToken` | A valid token and nothing else — no status gate | `/api/users/role`, `/api/users/signup` (both are called before the client's auth state has propagated), `/api/support/contact` (a suspended person most needs to know who to ask) |
| `optionalVerifiedToken` | Verifies a token only if one was sent, otherwise hands back `{ user: null }` | the two routes above that must stay reachable by anyone |

### 5.2 The dashboard guard

`src/app/dashboard/layout.jsx` mounts a single client-side guard,
`src/security/PrivateRoute.jsx`, which asks the pure policy function
`resolveDashboardAccess()` in `src/lib/routeAccess.js`. The decision order matters:

1. No session → the sign-in page.
2. `accountStatus: 'SUSPENDED'` → the suspension notice (this wins first, so a suspended
   person sees the reason instead of a generic refusal).
3. **An administrator-only route and the caller is not an administrator → refused.** This
   is checked before the application-form fallback on purpose, so `user` and `applicant`
   roles are refused outright rather than quietly redirected.
4. Administrator (any status) or `ACTIVE` caseworker → allowed.
5. Everyone else → the application form.

Administrator-only routes: `/dashboard/users` (and `/dashboard/users/[uid]`),
`/dashboard/requests`, `/dashboard/complaints`, `/dashboard/earnings-by-caseworker` and
`/dashboard/withdrawal-requests`. Everything else under `/dashboard` is shared and scopes
its own data by role.

A refusal is not just a redirect — the session is **ended**: the guard signs the user out
and sends them to `/forbidden`, returning `null` for the offending page so its
administrator-only content never paints. The `from` parameter is deliberately not carried
over for those paths, because signing back in would otherwise bounce the person straight
back to the page that just refused them.

This layer is UX plus defence in depth. **The API routes behind these pages remain the
authoritative boundary** — the client guard exists so nobody lands on an empty shell and a
"failed to load" toast when the APIs would have answered `403` anyway.

## 6. The money model

All of it lives in `src/lib/finance.js` (arithmetic), `src/lib/wallet.js` (balances) and
`src/lib/transactions.js` (the history view). Three ideas hold it together: money is
**derived, not stored**; a split is **frozen** the moment it is applied; and every
allocation is done in whole pence so the parts always add back up to the total.

### 6.1 Gross, VAT and net

| Term | Meaning |
|---|---|
| **Deal price** | The net figure agreed with the client (`dealPrice` on the case) |
| **VAT** | When the case is flagged VAT-applicable, 20% of the deal price is added at creation (`calculateDealVat`), giving the VAT-inclusive **total** the client is expected to pay |
| **Payment amount** | The gross money the client actually handed over in that term |
| **Net** | What is left after the VAT contained in that payment is separated out |

The VAT is **extracted from the gross** on approval, not added to it:

```
vat = gross × 20 ÷ 120
net = gross − vat
```

So a £1,200 term on a VAT-applicable case yields £200 VAT and £1,000 net, whatever the
case's headline price was. A payment on a non-VAT case yields no VAT and the net is the
whole amount.

### 6.2 The three-way split

The handler's own record carries the percentages — `handlerParcentage`, `hqParcentage`,
`elParcentage`. When a payment is approved:

1. The handler's stored percentages are resolved (`resolveSplit`). If any is missing, or
   if they do not total exactly 100%, the defaults for the handler's role are substituted
   and the response and audit entry both say so (`splitFallback: true`) instead of
   silently paying a different share than the one on file.

   | Handler type | Handler | Head Office | East London |
   |---|---|---|---|
   | `admin` (default) | 50% | 30% | 20% |
   | `caseworker` (default) | 50% | 10% | 40% |

2. The net is divided using the **largest-remainder method**: each share is computed in
   pence, floored, and the leftover pennies are handed to the largest fractional
   remainders (ties resolve handler → HQ → EL). This guarantees
   `handlerAmount + hqAmount + elAmount === net` exactly. Rounding each share on its own
   would not: £116.67 at 50/10/40 rounded independently summed to £116.68, and that stray
   penny leaked into the wallets and branch balances.
3. The result is written **once, frozen** into `profitDistributions`, together with the
   percentages that produced it:

```
{ paymentId, caseId, caseNumber, handlerId, handlerName, handlerType,
  net, handlerParcentage, hqParcentage, elParcentage,
  handlerAmount, hqAmount, elAmount, createdAt }
```

That frozen row is the historical truth. Changing a caseworker's percentages changes
**future** approvals only; the activity history and every statement read the stored
percentages and amounts, and never call `resolveSplit()` on current data.

### 6.3 A worked example

Deal price £1,000, VAT-applicable, paid in one term, handled by a caseworker on the
default 50/10/40 split:

| Step | Figure |
|---|---|
| VAT added at case creation | £200 |
| Total the client owes | £1,200 |
| Client pays (term 1) | £1,200 → `PENDING` |
| Administrator approves: VAT extracted | £200 |
| Net to distribute | £1,000 |
| Handler share (50%) | £500 → handler's wallet |
| Head Office share (10%) | £100 → HQ account |
| East London share (40%) | £400 → EL account |
| Sum of the three parts | £1,000 ✅ |

### 6.4 One deliberate rounding gap

VAT and net are each rounded to the nearest penny independently, so on some amounts the
pair does **not** add back up to the gross. £12.09 is a real example: VAT £2.01 + net
£10.07 = £12.08, one penny short. This affects the display and the ledger of the VAT and
net columns only — it never affects what is allocated, because `distribute()` always
splits the stored net exactly. It is a known, documented reconciliation gap rather than a
bug in the money movement.

## 7. Data model

One MongoDB database (the name `lawapp` is currently hardcoded in
`src/lib/collections.js` and `src/lib/media.js`), twelve declared collections, and no
schema migrations — documents are plain objects validated in the route handlers.

| Collection | Written by | Holds |
|---|---|---|
| `users` | sign-up, application, administrator lifecycle, profile edits | The account: `uid`, email, profile, `role`, `accountStatus`, practice snapshot, split percentages |
| `cases` | case creation and edit | The case: number, client snapshot, deal price and VAT, handler, status, approval, documents snapshot |
| `payments` | payment submission, administrator decision | Each term, its review state, and once approved the `vat` and `net` extracted from it |
| `profitDistributions` | payment approval (deleted on void) | The frozen split: `net`, the three percentages, the three amounts, and what they came from |
| `withdrawals` | withdrawal requests, branch payouts, administrator decisions | One collection for both: `account: HANDLER` for a wallet withdrawal, `HQ`/`EL` for a branch payout |
| `files` | media uploads and associations | Metadata for every uploaded document — content hash, owner, category, association. The **bytes** live in the GridFS bucket `media` |
| `complaints` | staff submissions, administrator review | Subject, message, status, `editedAt`/`editCount`, resolution note |
| `practices` | administrator only | The firm's practices, referenced by `practiceId` |
| `auditLogs` | every state change, plus email outcomes | The append-only trail |

Three identifiers are declared in `src/lib/collections.js` but **not written by the
application today**: `clients` (the client is embedded as a snapshot on each case
instead), `caseworkerAgreements` (profit-sharing lives on the user record and is frozen
per distribution), and `notifications` (notifications are sent by email and recorded in
`auditLogs` rather than stored in their own collection). They are reserved names, not
live data.

## 8. HTTP API surface

Everything is under `src/app/api/**` (one exception noted below). `—` means the route
performs its own checks rather than using one of the standard guards.

| Route | Methods | Guard | Notes |
|---|---|---|---|
| `/api/users/signup` | POST | `optionalVerifiedToken` + Firebase Admin lookup | Creates the account record; idempotent by uid **or** email |
| `/api/users/role` | GET | `optionalVerifiedToken` | Returns `role` and `accountStatus` only — the client's access decision |
| `/api/users/me` | GET, PATCH | `requireApplicantAccess` | The caller's own profile |
| `/api/users/application` | PATCH | `requireApplicantAccess` | Submit or edit the caseworker application |
| `/api/users/signin` | POST | — | **Legacy and unused by the client**; see [§11](#11-known-limits-and-deliberate-choices) |
| `/api/auth/verify-recaptcha` | POST | — | Server-side reCAPTCHA verification |
| `/api/support/contact` | GET | `requireVerifiedToken` | Current administrators to contact, resolved at request time |
| `/api/dashboard/stats` | GET | `requireAuth` | Role-scoped dashboard aggregates |
| `/api/cases` | GET, POST | `requireAuth` | Listing is scoped by role; creation requires documents and an assignable handler |
| `/api/cases/[id]` | GET, PATCH, DELETE | GET: `requireAuth` (scoped) · PATCH/DELETE: `requireAdmin` | Read, edit, reassign, delete |
| `/api/cases/[id]/review` | POST | `requireAdmin` | Approve or reject a caseworker-submitted case |
| `/api/payments` | GET, POST | `requireAuth` | Submit a term; list own (caseworker) or all (admin) |
| `/api/payments/[id]` | PATCH | `requireAdmin` | `approve` / `reject` / `void` |
| `/api/payments/earnings` | GET | `requireAuth` | Earnings aggregation |
| `/api/wallet` | GET | `requireAuth` | Firm view for an admin, personal wallet for a caseworker |
| `/api/wallet/transactions` | GET | `requireAuth` | Paged, filtered activity history |
| `/api/wallet/statement` | GET | `requireAuth` (firm scope admin-only) | Full range for CSV/PDF export, capped at 5 000 rows |
| `/api/wallet/withdraw` | POST | `requireAuth` | Request a withdrawal against the caller's own balance |
| `/api/media` | GET, POST | `requireAuth` | List (own, or all for an admin) and upload |
| `/api/media/[id]` | GET, DELETE | `requireAuth` | Serve bytes after an access check; delete only when unattached |
| `/api/complaints` | GET, POST | `requireAuth` | File a complaint; list own (admin sees all) |
| `/api/complaints/[id]` | PATCH | `requireAuth` | Owner-only edit while the complaint is open |
| `/api/admin/*` | — | `requireAdmin` on every method | `applications`, `caseworkers`, `users` (+`[uid]`), `handlers`, `practices`, `withdrawals`, `company-withdrawals`, `complaints`, `password-reset`, `email-test`, `db-check` |
| `/dashboard/application/review` | GET, PATCH | `requireAdmin` | A legacy duplicate of the applications admin API, kept because it is still reachable; it is admin-guarded like the rest |

## 9. Project layout

```
src/
  app/
    layout.js            root layout: font, auth provider, toasts, the dark class
    page.js              the sign-in / sign-up screen
    globals.css          Tailwind entry point
    forbidden/           the notice shown after an access refusal
    suspended/           the suspension notice
    not-found.jsx
    dashboard/           the authenticated area, wrapped once by PrivateRoute
      page.jsx           role-aware overview
      application/       the caseworker application form (+ a legacy review route)
      cases/             list, detail, edit
      payments/          the payment queue (admin) / own payments (caseworker)
      wallet/            balances, revenue calculator, per-payment earnings ledger
      activity-history/  the derived transaction ledger and statements
      earnings-by-case/  per-case totals, both roles
      earnings-by-caseworker/   per-handler totals, administrators only
      withdrawal-requests/      the payout desk
      complaints/  my-complaints/
      users/  requests/  help/  my-profile/  password-reset/
    api/                 every route handler — see §8
  components/
    auth/                SignIn, SignUp
    dashboard/           page-level UI, with admin/, applicant/, wallet/, complaints/
    charts/              recharts wrappers and the shared chart theme
    media/               media library and the in-app document viewer
    ui/                  shared primitives (dialogs, pagination, skeletons, spinner…)
    LawBg.jsx            animated canvas background on the sign-in screen
  context/               AuthContext + AuthProvider, the single source of auth state
  hooks/                 useAuth, useAxiosSecure, useWalletData, useTransactions, useAdminContacts
  firebase/              client Firebase configuration
  lib/                   the server-side brain
    auth.js              the five guards
    collections.js  mongodb.js
    finance.js           VAT, net, splits, rounding
    wallet.js            wallet and branch balances
    transactions.js  transactionQuery.js    the derived history
    cases.js  complaints.js  media.js  audit.js  administrators.js
    routeAccess.js       the dashboard route policy
    statementExport.js  format.js  utils.js
    email/               mailer.js, templates.js, notifications.js
  security/              PrivateRoute — the dashboard guard
  templates/             loading skeletons and the shared stylesheet
scripts/                 maintenance scripts (reset-data, reset-fresh)
docs/                    ACCOUNT_STATUS.md, EMAIL_NOTIFICATIONS.md
backups/                 dumps written by the maintenance scripts (git-ignored)
```

## 10. Running it

Requires a Node.js version supported by Next.js 16, a MongoDB deployment, and a Firebase
project (client configuration plus a service account). Email and reCAPTCHA are optional —
without email credentials the app works and simply logs that notifications were skipped.

```bash
npm install
npm run dev        # development server on http://localhost:3000
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint (the only automated check — there is no test suite)
```

### 10.1 Environment variables

`.env` is git-ignored and is read **once at startup**, so a changed value needs a restart,
not just a save.

| Group | Variables | Notes |
|---|---|---|
| Database | `MONGODB_URI` | Required — the app throws on boot without it. The database *name* is currently hardcoded in the app |
| Database (scripts) | `MONGODB_NAME` | Used only by the maintenance scripts, which default to the name the app hardcodes |
| Firebase client | `NEXT_PUBLIC_API_KEY`, `NEXT_PUBLIC_AUTH_DOMAIN`, `NEXT_PUBLIC_PROJECT_ID`, `NEXT_PUBLIC_STORAGE_BUCKET`, `NEXT_PUBLIC_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_APP_ID` | `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time |
| Firebase Admin | `FIREBASE_SERVICE_ACCOUNT` (full JSON), or `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`, or a local `src/lib/lawFirebaseAdmin.json` | Server-only; the local file is git-ignored |
| App URLs | `NEXT_PUBLIC_SERVER_URL` | Base URL for the client's authenticated requests |
| Email | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_HOST`, `GMAIL_PORT`, `GMAIL_FROM_NAME`, `GMAIL_REPLY_TO` | SMTP; the transport is created once and reused |
| Email links | `EMAIL_APP_URL` | Public site used for the buttons inside notification emails, and nothing else. Must be `https` on a real host — a localhost or plain-`http` value produces no link at all |
| Support | `NEXT_PUBLIC_SUPPORT_EMAIL`, `SUPPORT_EMAIL` | Shown on the Help page and used as a fallback mailbox. The Help page prefers the list of **current** administrators, resolved from the database at request time |
| reCAPTCHA | `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_RECAPTCHA_ENABLED` | Set the flag to `true` to switch verification on; `false` bypasses it |

### 10.2 Maintenance scripts

Both scripts are **dry runs by default** — they connect, read, print exactly what they would
do and write nothing. Add `--yes` to perform the work.

```bash
npm run reset:data          # clear business data, keep accounts
npm run reset:data:apply
npm run reset:fresh         # back up, then return the app to a brand-new state
npm run reset:fresh:apply
```

`reset:fresh` deletes every user except one kept administrator, all cases, payments, profit
distributions, withdrawals, audit logs, complaints and file metadata, the bytes of every
uploaded document in the GridFS bucket (including orphans), and every other Firebase Auth
account — while **keeping** the `practices` collection, which the approval flow requires.
Both scripts write a timestamped JSONL dump (and the media bytes) into `backups/` before
deleting anything, so a mistake is recoverable. Wallet balances are derived rather than
stored, so emptying the distributions and withdrawals drops every wallet — personal and
branch — to zero with no extra bookkeeping.

### 10.3 Deploying

1. Stop the server, `npm run build`, then start it again.
2. **Never build while the server is running.** `next build` rewrites `.next`, which a
   running `next start` serves from, so replacing it mid-flight makes individual requests
   fail intermittently around the build. This is a documented incident, not a theory.
3. Verify afterwards as an administrator: `GET /api/admin/email-test` reports whether email
   is configured, and `POST /api/admin/email-test` sends one sample. A healthy send leaves
   **no** `[email]` line in the server log — the mailer only logs failures and skips.

## 11. Known limits and deliberate choices

Stated plainly, because each of these is a decision somebody will otherwise re-litigate:

- **No automated tests.** `npm run lint` is the only automated check. The pure modules
  (`finance.js`, `wallet.js`, `transactions.js`, `routeAccess.js`) are written to be
  testable, but nothing exercises them in CI yet.
- **No email queue and no retry.** A notification is attempted once, at the moment of the
  event; if it fails, the audit row records it and nothing resends it.
- **Email deliverability is reputation, not code.** Sending from a consumer mailbox to
  people who have never corresponded with it can land in Spam. The durable fix is a sender
  on a domain the firm controls with SPF/DKIM/DMARC; only one module knows about the mail
  provider, so that change is configuration rather than a rewrite.
- **`requireAdmin` checks `role` only.** `accountStatus` is enforced for the dashboard and
  for notification recipients, so a `DEACTIVATED` administrator still holds administrator
  API access. Documented, not fixed.
- **The VAT/net penny gap** described in §6.4 — a display and ledger artifact, never a
  money-movement one.
- **The database name is hardcoded** (`lawapp`) in `src/lib/collections.js` and
  `src/lib/media.js`; `MONGODB_NAME` only affects the maintenance scripts. They will
  disagree if the environment variable is ever set to something else.
- **Case numbers are derived from a document count** (`countDocuments() + 1`). Deleting a
  case can hand its number to a new one, and two simultaneous creations can collide. It is
  adequate at this scale and is not a general solution.
- **`POST /api/users/signin` is a legacy, unauthenticated route** that inserts a user
  record. The client does not call it, and the record it writes (`role: 'caseworker'`,
  `PENDING`) can never reach the dashboard, but a state-changing route that creates records
  belongs behind a guard.
- **`/dashboard/application/review` duplicates the applications administrator API.** It is
  admin-guarded, but it is a second implementation of the same read that has to be kept in
  step with the first.
- **The legacy `APPROVED` status on administrator records forces deny-list checks.**
  Anything that asks "who is an administrator?" must keep excluding the out-of-service
  statuses (as `currentAdministrators()` does) instead of demanding `ACTIVE`, or working
  administrators silently disappear from lists.
- **reCAPTCHA is switchable off**, and a disabled flag bypasses verification entirely.
  There is also no rate limiting on the public endpoints; what protects the account-creating
  route is the Firebase Admin lookup, not throttling.
- **Leftover scaffolding**: the placeholder `/dashboard/[section]` route, three declared but
  unused collection names, and page metadata that still carries the earlier product name.

## 12. Further reading

- [`docs/ACCOUNT_STATUS.md`](docs/ACCOUNT_STATUS.md) — the authoritative `role` and
  `accountStatus` reference, including where each rule is enforced. Update it whenever a
  status or role is added.
- [`docs/EMAIL_NOTIFICATIONS.md`](docs/EMAIL_NOTIFICATIONS.md) — the full notification
  routing table, configuration, deployment and monitoring.
- [`report.md`](report.md) — an audit of the repository from an earlier stage of the build,
  kept for history.
- [`AGENTS.md`](AGENTS.md) — note for anyone (human or agent) writing code here: the
  Next.js version in this repository has breaking changes against older documentation.
  Read the guides under `node_modules/next/dist/docs/` before writing code, and heed the
  deprecation notices.
