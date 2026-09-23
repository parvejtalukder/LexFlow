'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowDownCircle, Building2, Download, History, Landmark, Receipt, X } from 'lucide-react';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useWalletData from '@/hooks/useWalletData';
import { SectionCard, StatCard, money, round2 } from '@/components/dashboard/wallet/WalletUI';

const SECONDARY_LINK =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800';

/**
 * Withdrawal dialog, shared by both roles: a caseworker draws from their wallet,
 * an admin from their own personal handler wallet. The amount is always
 * re-validated server-side against the caller's own withdrawable balance.
 */
function WithdrawDialog({ withdrawable, amount, onAmountChange, onClose, onSubmit, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Request Withdrawal
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Withdrawable {money(withdrawable)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="Amount (£)"
          className="mt-4 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
        />

        <button
          type="button"
          disabled={busy}
          onClick={onSubmit}
          className="mt-4 w-full rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? 'Requesting…' : 'Request Withdrawal'}
        </button>

        <p className="mt-3 text-[10px] text-gray-400">
          The money stays in your wallet until an admin marks the request as paid.
        </p>
      </div>
    </div>
  );
}

/**
 * Wallet.
 *
 * Kept deliberately simple, because every amount here already exists elsewhere:
 *   caseworker -> available balance, request withdrawal, transaction history
 *   admin      -> where the firm's money currently sits, plus their own personal
 *                 handler wallet (read-only - /api/wallet/withdraw refuses
 *                 admins by design, see src/app/api/wallet/withdraw/route.js)
 *
 * The figures are the ones /api/wallet already returns: nothing is recomputed
 * here and no new balance is invented. Detailed breakdowns live on Transaction
 * History and the earnings pages.
 */
export default function Wallet() {
  const axiosSecure = useAxiosSecure();
  const { data, loading, isAdmin, reload } = useWalletData();

  const [busy, setBusy] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const requestWithdrawal = async () => {
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid withdrawal amount.');
      return;
    }
    setBusy(true);
    const toastId = toast.loading('Requesting withdrawal…');
    try {
      const res = await axiosSecure.post('/api/wallet/withdraw', { amount });
      if (res.data?.success) {
        toast.success(res.data.message || 'Withdrawal requested.', { id: toastId });
        setShowWithdraw(false);
        setWithdrawAmount('');
        await reload();
      } else {
        toast.error(res.data?.error || 'Failed to request withdrawal.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to request withdrawal.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton stats={isAdmin ? 5 : 1} charts={0} />;

  const summary = data?.summary || {};

  // ---- CASEWORKER ---------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <SectionCard title="My Wallet" subtitle="Balance and payouts">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Available Balance
          </p>
          <p className="mt-1 text-4xl font-bold text-emerald-600 dark:text-emerald-400">
            {money(summary.available)}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Withdrawable now <strong>{money(summary.withdrawable)}</strong>
            {summary.pendingWithdrawalTotal > 0.001 ? (
              <> · {money(summary.pendingWithdrawalTotal)} reserved by open requests</>
            ) : null}
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowWithdraw(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <ArrowDownCircle className="h-4 w-4" /> Request Withdrawal
            </button>
            <Link
              href="/dashboard/activity-history"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              <History className="h-4 w-4" /> Transaction History
            </Link>
          </div>
        </SectionCard>

        {showWithdraw ? (
          <WithdrawDialog
            withdrawable={summary.withdrawable}
            amount={withdrawAmount}
            onAmountChange={setWithdrawAmount}
            onClose={() => setShowWithdraw(false)}
            onSubmit={requestWithdrawal}
            busy={busy}
          />
        ) : null}
      </div>
    );
  }

  // ---- ADMIN --------------------------------------------------------------
  const companyBalances = Object.fromEntries((data?.company || []).map((a) => [a.account, a]));
  const hq = companyBalances.HQ;
  const el = companyBalances.EL;
  const personal = data?.personal || {};
  // The figure that matters is what is still available to pay out: everything
  // recorded for handlers (summary.totalHandler) minus what has already been
  // paid to them (summary.totalWithdrawn) - the same relationship the per-wallet
  // computeWalletBalance() applies to a single caseworker. No value is
  // recalculated here; the two summary figures simply change places visually.
  const handlerAvailable = round2(
    (Number(summary.totalHandler) || 0) - (Number(summary.totalWithdrawn) || 0)
  );

  const firmTiles = [
    {
      label: 'Caseworkers / Handlers',
      // Prominent = available to pay out; the recorded total is the supporting line.
      value: handlerAvailable,
      icon: Receipt,
      tone: 'text-emerald-600 dark:text-emerald-400',
      subtitle: `Total recorded ${money(summary.totalHandler)} · Paid out ${money(summary.totalWithdrawn)}`,
    },
    {
      label: 'VAT Recorded / Payable',
      value: summary.totalVat,
      subtitle: 'Recorded on approved payments',
    },
    {
      label: 'HQ',
      value: hq ? Math.max(0, hq.withdrawable) : null,
      icon: Building2,
      tone: 'text-indigo-600 dark:text-indigo-400',
      subtitle: hq ? `Recorded ${money(hq.earned)} · Paid out ${money(hq.paid)}` : 'No HQ activity yet',
    },
    {
      label: 'East London',
      value: el ? Math.max(0, el.withdrawable) : null,
      icon: Landmark,
      tone: 'text-amber-600 dark:text-amber-400',
      subtitle: el
        ? `Recorded ${money(el.earned)} · Paid out ${money(el.paid)}`
        : 'No East London activity yet',
    },
  ];

  // computeCompanyBalance() deliberately allows a negative payout figure after a
  // payment is voided once its money has already been paid out. The tile shows
  // £0.00 in that case, so the shortfall is spelled out here instead of hidden.
  const overpaid = [
    hq && hq.withdrawable < -0.001
      ? `Head Office over-paid by ${money(Math.abs(hq.withdrawable))}`
      : null,
    el && el.withdrawable < -0.001
      ? `East London over-paid by ${money(Math.abs(el.withdrawable))}`
      : null,
  ].filter(Boolean);

  // Open handler requests have already claimed part of the available figure, so
  // it is stated rather than leaving the prominent number looking instantly
  // payable. Presentation only - summary.totalReserved is an existing value.
  const reservedForPayouts = Number(summary.totalReserved) || 0;

  return (
    <div className="space-y-4">
      <SectionCard title="Firm Wallet" subtitle="Available or recorded for each destination">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {firmTiles.map(({ label, value, icon, tone, subtitle }) => (
            <StatCard key={label} label={label} value={value} icon={icon} tone={tone} subtitle={subtitle} />
          ))}
        </div>

        {overpaid.length > 0 ? (
          <p className="mt-3 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            {overpaid.join(' · ')} — a voided payment removed money that had already been paid out.
          </p>
        ) : null}

        {reservedForPayouts > 0.001 ? (
          <p className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {money(reservedForPayouts)} of the handler figure is already reserved by withdrawal requests
            that are awaiting review or approved but not yet paid.
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-gray-400">
          Available = the existing wallet calculation&apos;s payout figure (recorded share minus amounts
          already paid). VAT is reported from approved payments; it is not a wallet balance.
        </p>

        <div className="mt-4">
          <Link
            href="/dashboard/activity-history?scope=firm"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <History className="h-4 w-4" /> Transaction History
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        title="My Personal Wallet"
        subtitle="Your own handler earnings"
        actions={
          <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Withdrawable {money(personal.withdrawable)}
          </span>
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Available Balance
        </p>
        <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
          {money(personal.available)}
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Earned {money(personal.totalEarned)} · paid out {money(personal.totalWithdrawn)}
          {personal.pendingWithdrawalTotal > 0.001
            ? ` · reserved ${money(personal.pendingWithdrawalTotal)}`
            : ''}
        </p>

        {!(Number(personal.totalEarned) > 0) ? (
          <p className="mt-2 text-[11px] text-gray-400">
            No handler earnings yet. An admin is already a valid case handler without any application —
            you appear in the case handler list, so assign yourself to a case and your share of each
            approved payment lands here to be withdrawn.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setShowWithdraw(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <ArrowDownCircle className="h-4 w-4" /> Request Withdrawal
          </button>
          <Link href="/dashboard/activity-history?scope=personal" className={SECONDARY_LINK}>
            <History className="h-4 w-4" /> Personal Transaction History
          </Link>
          <Link
            href="/dashboard/activity-history?scope=personal&statement=1"
            className={SECONDARY_LINK}
          >
            <Download className="h-4 w-4" /> Download Statement
          </Link>
        </div>

        <p className="mt-3 text-[11px] text-gray-400">
          Your handler earnings are your own: a request only ever draws on this balance and never on
          HQ or East London money. As with every payout it is reviewed and paid from Withdrawal
          Requests.
        </p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Link
          href="/dashboard/withdrawal-requests"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Withdrawal Requests</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Review, approve, pay and reverse payouts — caseworker wallets and branch accounts.
          </p>
        </Link>
        <Link
          href="/dashboard/earnings-by-caseworker"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Earnings by Caseworker</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Handler share, branch splits, withdrawals and reservations for every caseworker.
          </p>
        </Link>
        <Link
          href="/dashboard/earnings-by-case"
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Earnings by Case</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            What each case billed and what it distributed across the firm.
          </p>
        </Link>
      </div>

      {showWithdraw ? (
        <WithdrawDialog
          withdrawable={personal.withdrawable}
          amount={withdrawAmount}
          onAmountChange={setWithdrawAmount}
          onClose={() => setShowWithdraw(false)}
          onSubmit={requestWithdrawal}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

