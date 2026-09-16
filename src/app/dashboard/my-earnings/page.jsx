import { redirect } from 'next/navigation';

/**
 * My Earnings was merged into My Wallet: the balances, the revenue calculator
 * and the per-payment earnings ledger all live on `/dashboard/wallet` now, and
 * the per-case totals moved to `/dashboard/earnings-by-case`. This route only
 * survives so old bookmarks and in-app links keep working.
 */
export default function MyEarningsPage() {
  redirect('/dashboard/wallet');
}