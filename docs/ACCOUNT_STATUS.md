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
| `caseworker` | Approved caseworker (must also have `accountStatus` = `ACTIVE` or `SUSPENDED`). |
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
