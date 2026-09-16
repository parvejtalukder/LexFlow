'use client';

import useAuth from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { ShieldX } from 'lucide-react';

export default function ForbiddenPage() {
  const { user, logOut } = useAuth();
  const router = useRouter();

  // `src/security/PrivateRoute.jsx` ends the session *before* redirecting here,
  // so a refused visitor arrives already signed out. A live session therefore
  // means the page was opened directly (e.g. someone typing the URL); the button
  // below then ends that session before handing back to sign-in.
  const hasSession = Boolean(user);

  const handlePrimaryAction = async () => {
    // Already signed out by the guard -> back to sign-in.
    if (!hasSession) {
      router.replace('/');
      return;
    }

    // Session still alive (direct visit, e.g. someone typing the URL): the
    // button offers to sign in, so end any surviving session first.
    try {
      await logOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
    router.replace('/');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-100 shadow-2xl">
        <div className="mx-auto mb-4 grid size-14 place-content-center rounded-2xl bg-red-500/10 text-red-400">
          <ShieldX className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-serif font-bold text-white">403 Forbidden</h1>
        <p className="text-sm text-slate-400 mt-2">
          You do not have permission to view that page.
        </p>
        {!hasSession && (
          <p className="text-sm text-slate-400 mt-1">
            For your security you have been signed out.
          </p>
        )}
        {user?.email && <p className="text-xs text-slate-500 mt-3">{user.email}</p>}
        <button
          type="button"
          onClick={handlePrimaryAction}
          className="mt-6 w-full py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-200 transition-colors"
        >
          Sign In
        </button>
      </div>
    </div>
  );
}