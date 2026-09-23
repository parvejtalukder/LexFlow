'use client';

import { Mail } from 'lucide-react';
import useAdminContacts from '@/hooks/useAdminContacts';

const SUBJECT = 'LexFlow support request';

const mailtoOf = (email) => `mailto:${email}?subject=${encodeURIComponent(SUBJECT)}`;

/**
 * Every administrator's contact details.
 *
 * All of them are listed, each with its own mailto link, so nobody has to guess
 * which administrator is the live one - or ask one person when another is available.
 *
 * The list is resolved live from the user records (see useAdminContacts), so a
 * demotion, suspension, address change or deletion is reflected immediately. When
 * no administrator can be reached it falls back to the configured mailbox, and when
 * there is not even that it says so plainly rather than offering a mailto link to
 * an address that may no longer exist.
 */
export default function AdminContacts() {
  const { contacts, mailbox, loading } = useAdminContacts();

  // A mailbox is only ever the fallback for "no administrator account can be reached".
  const rows = contacts.length > 0 ? contacts : mailbox ? [{ name: null, email: mailbox }] : [];

  if (loading) {
    return <p className="text-[11px] text-gray-400">Checking who to contact…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        No administrator contact is set up yet. Ask whoever created your account, or whoever runs this
        system for the firm.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {rows.map((contact) => (
          <li key={contact.email}>
            <a
              href={mailtoOf(contact.email)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950/40 dark:hover:border-gray-700"
            >
              <Mail className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                  {contact.email}
                </span>
                {contact.name ? (
                  <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {contact.name}
                  </span>
                ) : null}
              </span>
            </a>
          </li>
        ))}
      </ul>

      {contacts.length > 1 ? (
        <p className="text-[11px] text-gray-400">
          All {contacts.length} administrators are listed — write to whichever is available.
        </p>
      ) : null}

      {contacts.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          No administrator account is active at the moment, so this mailbox is shown instead.
        </p>
      ) : null}
    </div>
  );
}
