import { NextResponse } from 'next/server';
import { requireVerifiedToken } from '@/lib/auth';
import { currentAdministrators } from '@/lib/administrators';

/**
 * Who to contact about this system.
 *
 * Returns EVERY current administrator, not one chosen address, so the Help page can
 * list them all and nobody has to guess which is live.
 *
 * Behind requireVerifiedToken rather than requireAuth: a suspended or deactivated
 * account is exactly the person who most needs to know who to ask, and requireAuth
 * answers those statuses with 403. The same narrow exemption is already used by
 * /api/users/role, which has to keep answering for an account the rest of the API
 * is refusing.
 *
 * Only a name and an email address is returned - no uids, roles, account statuses
 * or counts. Staff addresses are already visible to signed-in users, but nothing
 * beyond them is exposed here.
 *
 * The fallback mailbox is read at request time, so it can be changed without
 * rebuilding the app.
 */
export async function GET(request) {
  const auth = await requireVerifiedToken(request);
  if (auth.error) return auth.error;

  const admins = await currentAdministrators();
  const mailbox = String(
    process.env.SUPPORT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || ''
  ).trim();

  return NextResponse.json({
    success: true,
    contacts: admins,
    mailbox: mailbox || null,
    // 'admin' when at least one person can be reached, else the role mailbox, else
    // nothing - and the UI must then offer no email action rather than a dead one.
    source: admins.length > 0 ? 'admin' : mailbox ? 'mailbox' : 'none',
  });
}
