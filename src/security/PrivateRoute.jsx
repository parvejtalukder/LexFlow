'use client';

import useAuth from '@/hooks/useAuth';
import Loader from '@/templates/loader/Loader';
import DashboardSkeleton from '@/templates/loader/DashboardSkeleton';
import ApplicationSkeleton from '@/templates/loader/ApplicationSkeleton';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  DASHBOARD_ACCESS,
  FORBIDDEN_PATH,
  isAdminOnlyPath,
  resolveDashboardAccess,
} from '@/lib/routeAccess';

// Destination for users who have not been granted dashboard access yet.
const APPLICATION_PATH = '/dashboard/application';
const DASHBOARD_PATH = '/dashboard';
const SUSPENDED_PATH = '/suspended';
const SIGNIN_PATH = '/';

const PrivateRoute = ({ children }) => {
  const { user, loading, role, accountStatus, logOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isOnApplicationPage =
    pathname === APPLICATION_PATH || pathname?.startsWith(`${APPLICATION_PATH}/`);

  // `loading` also covers the window where the role/accountStatus lookup is
  // still in flight; role is null then, which would look like a non-admin and
  // wrongly refuse an admin. Never decide anything before it settles.
  const access = loading
    ? null
    : resolveDashboardAccess({ user, role, accountStatus, pathname });
  const isForbidden = access === DASHBOARD_ACCESS.FORBIDDEN;

  // Sign out exactly once, however many times the effect re-runs while the
  // session is being torn down.
  const forbiddenHandled = useRef(false);

  useEffect(() => {
    if (loading) return;

    // A signed-in non-admin asked for an admin-only page -> end the session and
    // hand them to the 403 notice. `from` is deliberately NOT carried over:
    // signing back in would otherwise bounce them straight back into the page
    // that just refused them.
    if (isForbidden) {
      if (forbiddenHandled.current) return;
      forbiddenHandled.current = true;
      // `logOut` rethrows (and already logs) on failure, so swallow it here and
      // still show the notice: the page refused access either way.
      logOut()
        .catch(() => {})
        .finally(() => router.replace(FORBIDDEN_PATH));
      return;
    }

    // Not signed in -> send to the sign-in page.
    if (access === DASHBOARD_ACCESS.SIGNIN) {
      // The sign-out above may land here before its redirect runs; keep heading
      // for the notice instead of racing it back to the sign-in page.
      if (forbiddenHandled.current) {
        router.replace(FORBIDDEN_PATH);
        return;
      }
      // Never hand `from` an admin-only path: whichever account signs in next
      // could be a non-admin, and would be refused all over again.
      const target = isAdminOnlyPath(pathname)
        ? SIGNIN_PATH
        : `${SIGNIN_PATH}?from=${encodeURIComponent(pathname)}`;
      router.replace(target);
      return;
    }

    // Suspended users can log in but only see the suspension notice.
    if (access === DASHBOARD_ACCESS.SUSPENDED) {
      if (pathname !== SUSPENDED_PATH) {
        router.replace(SUSPENDED_PATH);
      }
      return;
    }

    // Admin or approved caseworker -> allow, and NEVER leave them on the
    // application page (redirect them to the real dashboard instead).
    if (access === DASHBOARD_ACCESS.ALLOW) {
      if (isOnApplicationPage) {
        router.replace(DASHBOARD_PATH);
      }
      return;
    }

    // Restricted user not already on the application page -> redirect there.
    if (!isOnApplicationPage) {
      router.replace(APPLICATION_PATH);
    }
  }, [
    user,
    loading,
    access,
    isForbidden,
    isOnApplicationPage,
    pathname,
    router,
    logOut,
  ]);

  if (loading) {
    return isOnApplicationPage ? <ApplicationSkeleton /> : <DashboardSkeleton />;
  }

  // The admin-only page must never paint for a non-admin, not even for the
  // frame it takes the sign-out to finish.
  if (isForbidden) {
    return null;
  }

  if (!user) {
    return <Loader />;
  }

  // Authorized users may render the dashboard (and are redirected off the
  // application page by the effect above). Restricted users may only render
  // the application page.
  if (access === DASHBOARD_ACCESS.ALLOW) {
    return children;
  }

  if (isOnApplicationPage) {
    return children;
  }

  return null;
};

export default PrivateRoute;