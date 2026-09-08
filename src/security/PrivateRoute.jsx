'use client';

import useAuth from '@/hooks/useAuth';
import Loader from '@/templates/loader/Loader';
import DashboardSkeleton from '@/templates/loader/DashboardSkeleton';
import ApplicationSkeleton from '@/templates/loader/ApplicationSkeleton';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Destination for users who have not been granted dashboard access yet.
const APPLICATION_PATH = '/dashboard/application';
const DASHBOARD_PATH = '/dashboard';
const SUSPENDED_PATH = '/suspended';

const PrivateRoute = ({ children }) => {
  const { user, loading, role, accountStatus } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // --- Access lifecycle rules -------------------------------------------------
  // Admin: full access regardless of accountStatus.
  const isAdmin = role === 'admin';
  // Approved caseworker: full access.
  const isApprovedCaseworker = role === 'caseworker' && accountStatus === 'ACTIVE';
  // Everyone else (pending / unregistered / applicant / rejected) is restricted.
  const canAccessDashboard = isAdmin || isApprovedCaseworker;

  const isOnApplicationPage =
    pathname === APPLICATION_PATH || pathname?.startsWith(`${APPLICATION_PATH}/`);

  useEffect(() => {
    if (loading) return;

    // Not signed in -> send to the sign-in page.
    if (!user) {
      router.replace(`/?from=${encodeURIComponent(pathname)}`);
      return;
    }

    // Suspended users can log in but only see the suspension notice.
    if (accountStatus === 'SUSPENDED') {
      if (pathname !== SUSPENDED_PATH) {
        router.replace(SUSPENDED_PATH);
      }
      return;
    }

    // Admin or approved caseworker -> allow, and NEVER leave them on the
    // application page (redirect them to the real dashboard instead).
    if (canAccessDashboard) {
      if (isOnApplicationPage) {
        router.replace(DASHBOARD_PATH);
      }
      return;
    }

    // Restricted user not already on the application page -> redirect there.
    if (!isOnApplicationPage) {
      router.replace(APPLICATION_PATH);
    }
  }, [user, loading, accountStatus, canAccessDashboard, isOnApplicationPage, pathname, router]);

  if (loading) {
    return isOnApplicationPage ? <ApplicationSkeleton /> : <DashboardSkeleton />;
  }

  if (!user) {
    return <Loader />;
  }

  // Authorized users may render the dashboard (and are redirected off the
  // application page by the effect above). Restricted users may only render
  // the application page.
  if (canAccessDashboard) {
    return children;
  }

  if (isOnApplicationPage) {
    return children;
  }

  return null;
};

export default PrivateRoute;