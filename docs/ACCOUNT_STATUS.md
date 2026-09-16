# LexFlow — Account Status & Role Reference

Single source of truth for the `accountStatus` and `role` values used across the
system. Do **not** introduce new status/role strings without updating this file.

---

## Roles

Stored on the `users` collection (`role` field). Authorization reads this field
via `GET /api/users/role`.

| Role | Meaning |
|---|---|
| `admin` | Full access to the admin dashboard and every admin API. |
| `caseworker` | Approved caseworker. Only `ACTIVE` ones may be handed cases (see [Assignable handlers](#assignable-handlers)). |
| `applicant` | A user who has submitted a caseworker application. |
| `user` | A registered account that has not (yet) applied. |

> `applicant` is not an approved caseworker. It only means "has an application
> on file".

---

## Account statuses

Stored on the `users` collection (`accountStatus` field).

| Status | Applies to | Meaning | Reversible? |
|---|---|---|---|
| `PENDING` | applicant | Application submitted, awaiting admin review | — |
| `REJECTED` | applicant | Application rejected | ✅ resubmit → `PENDING` |
| `ACTIVE` | caseworker | Approved and able to work | — |
| `SUSPENDED` | caseworker | Temporarily blocked | ✅ reactivate → `ACTIVE` |
| `DEACTIVATED` | user / caseworker | Soft-deleted (offboarded, record preserved) | ❌ terminal |
| `APPROVED` | admin (legacy) | Admin account is active | — |
| `UNREGISTERED` | (none) | Returned by the role endpoint when no DB record exists | — |

### Why both `SUSPENDED` and `DEACTIVATED`

They represent different intents and must not be merged:

- **`SUSPENDED`** = "pause access for now" → the caseworker stays on the roster
  and can be **Reactivated**.
- **`DEACTIVATED`** = "remove permanently, keep history" → a soft delete that
  preserves the user and their historical cases/payments/profit-distributions.
  They are not reactivated; they would re-apply / be re-onboarded.

---

## Caseworker lifecycle

```
(user registers)  role=user, status=PENDING(initial)  — not yet an application
        │
        ▼  submits application (PATCH /api/users/application)
   role=applicant, status=PENDING
        │
        ├─ Admin approves (PATCH /api/admin/applications) ── requires practiceId
        │      role=caseworker, status=ACTIVE, practiceId + practiceName set
        │
        └─ Admin rejects (PATCH /api/admin/applications)
               status=REJECTED, rejectionReason saved

   ACTIVE ── suspend ──► SUSPENDED ── reactivate ──► ACTIVE
      │                       │
      └── deactivate ─────────┴──► DEACTIVATED   (terminal)
```

---

## Where each transition happens

| Transition | Route |
|---|---|
| `user` → `applicant` / `PENDING` (submit + resubmit) | `PATCH /api/users/application` |
| `PENDING` → `ACTIVE` (approve + assign practice) | `PATCH /api/admin/applications` |
| `PENDING` → `REJECTED` (reject + reason) | `PATCH /api/admin/applications` |
| `ACTIVE` → `SUSPENDED` | `PATCH /api/admin/caseworkers` (`action: suspend`) |
| `SUSPENDED` → `ACTIVE` | `PATCH /api/admin/caseworkers` (`action: reactivate`) |
| `ACTIVE`/`SUSPENDED` → `DEACTIVATED` | `DELETE /api/admin/caseworkers` |
| any user → `DEACTIVATED` (soft delete) | `DELETE /api/admin/users` |
| any user → change `accountStatus` | `PATCH /api/admin/users` |

---

## Assignable handlers

Who may be given a case. Enforced server-side by `isValidHandler()` in
`src/lib/cases.js` — used by `POST /api/cases` (creation) and
`PATCH /api/cases/[id]` (reassignment) — and mirrored by `GET /api/admin/handlers`,
which feeds the Handler dropdown on the case-creation form.

| Role | Assignable when |
|---|---|
| `admin` | Always. Admins are never gated on `accountStatus`; they keep full access via `PrivateRoute` too, and an admin record may carry the legacy `APPROVED` status instead of `ACTIVE`. |
| `caseworker` | Only when `accountStatus` = `ACTIVE` — i.e. approved and currently working. |

`SUSPENDED`, `DEACTIVATED`, `REJECTED`, `PENDING` and legacy `APPROVED`
caseworkers must **never** be assignable, and are excluded from the Handler
dropdown.

> Every transition in the table above rewrites **only** `accountStatus`, so a
> suspended, deactivated or rejected account still carries
> `role: 'caseworker'`. Always check the status — never the role alone.

---

## Admin-only routes

Which dashboard routes a role may open is decided client-side by
`resolveDashboardAccess()` in `src/lib/routeAccess.js`, consumed by the single
guard `src/security/PrivateRoute.jsx` (mounted once in
`src/app/dashboard/layout.jsx`). The API routes behind those pages remain the
authoritative security boundary — this layer is UX plus defence in depth.

| Route | Who may open it |
|---|---|
| `/dashboard/users` (and `/dashboard/users/[uid]`), `/dashboard/requests`, `/dashboard/earnings-by-caseworker`, `/dashboard/withdrawal-requests` | `admin` only (`ADMIN_ONLY_PATHS`). |
| `/dashboard/cases` (and `/dashboard/cases/[id]`), `/dashboard/payments`, `/dashboard/wallet`, `/dashboard/earnings-by-case`, `/dashboard/activity-history` | Admins **and** `ACTIVE` caseworkers — shared pages that scope their own data by role via an `isAdmin` check. |

> `/dashboard/cases/[id]/edit` is deliberately shared at the route level but
> admin-only in effect: the Edit shortcut is only rendered for admins, and
> `PATCH /api/cases/[id]` answers 403 to everyone else.

> `/dashboard/my-earnings` no longer renders a page of its own — it redirects to
> `/dashboard/wallet`, where the balances, the revenue calculator and the
> per-payment earnings ledger now live. Per-case totals moved to
> `/dashboard/earnings-by-case`.

Decision order: no session → sign-in; `SUSPENDED` → `/suspended`; **admin-only
route and not an admin → refused**; admin or `ACTIVE` caseworker → allowed;
everyone else → the application form. The refusal check runs before the
application-form fallback on purpose, so `user`/`applicant` roles are also
refused rather than quietly redirected.

A refusal is not just a redirect to a notice page — the session is **ended**:

1. `PrivateRoute` calls `logOut()` and `router.replace('/forbidden')`, returning
   `null` for the offending page so its admin-only content never paints.
2. `/forbidden` (`src/app/forbidden/page.jsx`) shows "403 Forbidden … you have
   been signed out" with a Sign In button. It stays presentational: the sign-out
   happens in the guard so a Back button or a closed tab cannot leave a session
   alive, and a direct visit never signs anyone out.

`from` is deliberately **not** carried over for admin-only paths. `SignIn` does
`searchParams.get('from') || '/dashboard'`, so preserving it would bounce a
caseworker straight back to the page that just refused them, forever.

---

## Practice (separate concept)

- Stored in the `practices` collection (admin-managed).
- A caseworker references it via `practiceId` (ObjectId) **and** keeps a
  `practiceName` snapshot for display + historical integrity.
- Practice ≠ `CaseworkerAgreement` (profit-sharing percentages). Do not conflate.

---

## Notes

- `role`/`accountStatus` are the authoritative authorization source in MongoDB.
  Firebase custom claims are set best-effort on approval but are not the source
  of truth.
- Every state change above writes an `auditLogs` entry.
