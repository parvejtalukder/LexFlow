/**
 * Who the current administrators are.
 *
 * Resolved from the user records at request time rather than configured, so the
 * contact shown to staff follows a demotion, suspension, email change or deletion
 * by itself. The Help page previously named a single address held in
 * NEXT_PUBLIC_SUPPORT_EMAIL, which Next.js inlines into the client bundle at build
 * time - so revoking that administrator left their address on screen indefinitely
 * with no way for the app to notice.
 *
 * "Current" means an account that can actually administer: the role is `admin` and
 * the API has not refused the account. OUT_OF_SERVICE_STATUSES is imported from the
 * auth module rather than repeated here, because that is exactly the list
 * requireAuth() answers 403 for - advertising an address the API would refuse would
 * be worse than showing nothing.
 *
 * Deliberately a deny-list rather than "must be ACTIVE": administrator records
 * still carrying the legacy 'APPROVED' status are working administrators, so a
 * whitelist would silently drop them.
 *
 * Server-only: it reads the database.
 */

import { OUT_OF_SERVICE_STATUSES } from '@/lib/auth';
import { COLLECTIONS, getCollection } from '@/lib/collections';

/**
 * Every administrator a person could usefully contact, oldest first.
 *
 * All of them, not a chosen one: with more than one administrator the caller shows
 * the whole list, so a caseworker never has to guess which address is the live one.
 *
 * The order is stable and predictable (the founding administrator leads) and
 * duplicate addresses are collapsed, because one person can hold more than one
 * record - re-registering creates a second uid against the same email.
 *
 * A lookup failure returns an empty list rather than throwing: this feeds a
 * "who do I ask" panel, which must degrade to "no contact shown", never to a
 * crashed page or a mailto link pointing at an address that may not exist.
 *
 * @returns {Promise<Array<{ name: string|null, email: string }>>}
 */
export async function currentAdministrators() {
  try {
    const users = await getCollection(COLLECTIONS.USERS);
    const admins = await users.find({ role: 'admin' }).sort({ createdAt: 1 }).toArray();

    const seen = new Set();
    const contacts = [];

    for (const admin of admins) {
      const email = String(admin.email || '').trim();
      // No address means nothing to show and nowhere to write to.
      if (!email) continue;
      if (OUT_OF_SERVICE_STATUSES.includes(admin.accountStatus)) continue;

      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      contacts.push({
        name: String(admin.fullName || '').trim() || null,
        email,
      });
    }

    return contacts;
  } catch (error) {
    console.error('[support] administrator lookup failed:', error?.message || error);
    return [];
  }
}
