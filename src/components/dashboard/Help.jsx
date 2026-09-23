'use client';

import Link from 'next/link';
import { KeyRound, LifeBuoy, UserRound } from 'lucide-react';
import { SectionCard } from '@/components/dashboard/wallet/WalletUI';
import AdminContacts from '@/components/dashboard/AdminContacts';

const CARD =
  'rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-800';

/**
 * Help.
 *
 * There is no ticket system behind this — it simply gives people one obvious way
 * to reach the administrators, plus direct links to the two self-service pages.
 *
 * The addresses are not written here. Every current administrator is resolved from
 * the user records at request time (see AdminContacts), so promoting, demoting,
 * suspending or deleting an administrator changes this page immediately, with no
 * code change and no redeploy. The previous single address came from
 * NEXT_PUBLIC_SUPPORT_EMAIL, which Next.js inlines into the client bundle at build
 * time, so it kept naming a revoked administrator indefinitely.
 */
export default function Help() {
  return (
    <div className="space-y-4">
      <SectionCard title="Help & support" subtitle="Reach the administrators who run this system">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Something not working, or something you need changed? Email an administrator and mention the
          case or payment you are asking about, so it can be found quickly. Every administrator is listed
          below.
        </p>

        <div className="mt-4">
          <AdminContacts />
        </div>

        <p className="mt-3 flex items-start gap-2 text-[11px] text-gray-400">
          <LifeBuoy className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Include what you expected to happen and what happened instead — screenshots help.
        </p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Link href="/dashboard/password-reset" className={CARD}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <KeyRound className="h-4 w-4 text-gray-400" /> Forgotten your password?
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Send yourself a secure reset link and choose a new password.
          </p>
        </Link>

        <Link href="/dashboard/my-profile" className={CARD}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <UserRound className="h-4 w-4 text-gray-400" /> Update your details
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Change your name, phone number, address or job title.
          </p>
        </Link>
      </div>
    </div>
  );
}
