'use client';

import useAuth from '@/hooks/useAuth';
import Loader from '@/templates/loader/Loader';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const AdminRoute = ({ children }) => {
  const { loading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Admins get full access regardless of accountStatus.
  const isAuthorized = role === 'admin';

  useEffect(() => {
    if (!loading && !isAuthorized) {
      router.replace(`/?from=${encodeURIComponent(pathname)}`);
    }
  }, [loading, isAuthorized, router, pathname]);

  if (loading) {
    return <Loader />;
  }

  return isAuthorized ? children : null;
};

export default AdminRoute;