/**
 * Route-level access policy for the /dashboard tree.
 *
 * The dashboard itself is guarded client-side by `src/security/PrivateRoute.jsx`;
 * the API routes behind it remain the authoritative security boundary. This
 * module exists so the "who may open which dashboard route" rules live in one
 * pure, testable place instead of being spread across React components.
 */

// Routes under /dashboard that only an admin may open. Each one renders a
// component that immediately calls admin-only APIs (`/api/admin/users`,
// `/api/admin/applications`, ...), all of which answer 403 to anyone else — so
// without this list a caseworker lands on an empty shell and a "Failed to load"
// toast instead of a clear refusal.
//
// `/dashboard/cases`, `/dashboard/payments`, `/dashboard/wallet`,
// `/dashboard/earnings-by-case` and `/dashboard/activity-history` are
// deliberately NOT listed: they are shared, and scope their data by role (each
// one reads its own `isAdmin` flag off the same `/api/wallet` payload).
export const ADMIN_ONLY_PATHS = [
  '/dashboard/users',
  '/dashboard/requests',
  '/dashboard/earnings-by-caseworker',
  '/dashboard/withdrawal-requests',
  // Complaints review is admin-only; caseworkers file theirs under
  // /dashboard/my-complaints, which stays open to them.
  '/dashboard/complaints',
];

// Where a non-admin is sent after being signed out for an admin-only route.
export const FORBIDDEN_PATH = '/forbidden';

/**
 * Is this pathname inside an admin-only route?
 *
 * Matches the path itself and real child segments (`/dashboard/users/42`) but
 * never a look-alike prefix such as `/dashboard/users-export`.
 *
 * @param {string|null|undefined} pathname
 * @returns {boolean}
 */
export function isAdminOnlyPath(pathname) {
  if (!pathname) return false;
  return ADMIN_ONLY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

// What the guard should do for the current user + route.
export const DASHBOARD_ACCESS = {
  ALLOW: 'allow',
  SIGNIN: 'signin',
  SUSPENDED: 'suspended',
  APPLICATION: 'application',
  FORBIDDEN: 'forbidden',
};

/**
 * Decide what should happen for a user on a /dashboard route.
 *
 * Order matters:
 *  1. no session            -> sign in
 *  2. accountStatus SUSPENDED -> the suspension notice (still wins, so a
 *     suspended account keeps seeing the reason it cannot work instead of a
 *     generic refusal)
 *  3. admin-only route and the caller is not an admin -> forbidden (this is
 *     checked before the application-page fallback so `applicant` / `user`
 *     roles are refused too, not quietly redirected)
 *  4. admin (any accountStatus) or ACTIVE caseworker -> allow
 *  5. everyone else (pending / applicant / unregistered / rejected) -> the
 *     application form
 *
 * Callers MUST NOT evaluate this while auth state is still loading: `role` is
 * null in that window, which would look like a non-admin and wrongly refuse an
 * admin.
 *
 * @param {{ user: object|null, role: string|null, accountStatus: string|null, pathname: string|null }} input
 * @returns {string} one of DASHBOARD_ACCESS
 */
export function resolveDashboardAccess({ user, role, accountStatus, pathname }) {
  if (!user) return DASHBOARD_ACCESS.SIGNIN;

  if (accountStatus === 'SUSPENDED') return DASHBOARD_ACCESS.SUSPENDED;

  if (isAdminOnlyPath(pathname) && role !== 'admin') {
    return DASHBOARD_ACCESS.FORBIDDEN;
  }

  const canAccessDashboard =
    role === 'admin' || (role === 'caseworker' && accountStatus === 'ACTIVE');

  return canAccessDashboard ? DASHBOARD_ACCESS.ALLOW : DASHBOARD_ACCESS.APPLICATION;
}