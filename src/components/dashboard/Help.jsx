'use client';

import Link from 'next/link';
import { KeyRound, LifeBuoy, Mail, UserRound } from 'lucide-react';
import { SectionCard } from '@/components/dashboard/wallet/WalletUI';

/**
 * Support address. Kept in NEXT_PUBLIC_SUPPORT_EMAIL so it can be changed
 * without a code edit; the fallback is the administrator account on file.
 */
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'pht.cse@gmail.com';

const CARD =
  'rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-800';

/**
 * Help.
 *
 * There is no ticket system behind this — it simply gives people one obvious way
 * to reach the administrator, plus direct links to the two self-service pages.
 */
export default function Help() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('LexFlow support request')}`;

  return (
    <div className="space-y-4">
      <SectionCard title="Help & support" subtitle="Reach the administrator who runs this system">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Something not working, or something you need changed? Email the administrator and mention the
          case or payment you are asking about, so it can be found quickly.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <a
            href={mailto}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Mail className="h-4 w-4" /> Email the administrator
          </a>
          <span className="text-sm text-gray-500 dark:text-gray-400">{SUPPORT_EMAIL}</span>
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
