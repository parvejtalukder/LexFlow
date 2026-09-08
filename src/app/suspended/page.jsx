'use client';

import useAuth from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

export default function SuspendedPage() {
  const { user, logOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await logOut();
    router.replace('/');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-100 shadow-2xl">
        <div className="mx-auto mb-4 grid size-14 place-content-center rounded-2xl bg-amber-500/10 text-amber-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-serif font-bold text-white">Account Suspended</h1>
        <p className="text-sm text-slate-400 mt-2">
          Your account has been suspended. Please contact your administrator for assistance.
        </p>
        {user?.email && <p className="text-xs text-slate-500 mt-3">{user.email}</p>}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 w-full py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-200 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
