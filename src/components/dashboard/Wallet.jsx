'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import {
  Wallet as WalletIcon,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  X,
  Banknote,
  Building2,
  Landmark,
  RotateCcw,
} from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import ChartCard from '@/components/charts/ChartCard';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { CHART_COLORS, SPLIT_COLORS, humanizeStatus } from '@/components/charts/chartTheme';

const PER_PAGE = 8;

const money = (v) =>
  v == null ? '—' : `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

const statusTone = {
  PAID: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  REJECTED: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
};

/** Withdrawal lifecycle colours for the payout pipeline chart. */
const WITHDRAWAL_STATUS_COLORS = {
  PENDING: CHART_COLORS.amber,
  APPROVED: CHART_COLORS.blue,
  PAID: CHART_COLORS.emerald,
  REJECTED: CHART_COLORS.rose,
};

function StatusBadge({ status }) {
  const tone = statusTone[status] || statusTone.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value, tone, icon: Icon, plain = false }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-gray-400" /> : <WalletIcon className="h-4 w-4 text-gray-400" />}
      </div>
      <p className={`mt-2 text-2xl font-bold ${tone || 'text-gray-900 dark:text-gray-100'}`}>
        {plain ? (value ?? '—') : money(value)}
      </p>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle ? <span className="text-xs text-gray-400">{subtitle}</span> : null}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function Wallet() {
  const axiosSecure = useAxiosSecure();
  const { role } = useAuth();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payReference, setPayReference] = useState('');

  const [page, setPage] = useState(1);

  // ---- Branch (Head Office / East London) payouts --------------------------
  const [companyAccount, setCompanyAccount] = useState(null); // 'HQ' | 'EL' | null
  const [companyAmount, setCompanyAmount] = useState('');
  const [companyMethod, setCompanyMethod] = useState('Bank Transfer');
  const [companyRef, setCompanyRef] = useState('');
  const [companyNote, setCompanyNote] = useState('');
  const [reversingPayout, setReversingPayout] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [wdAccountFilter, setWdAccountFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/wallet');
      if (res.data?.success) setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load wallet.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

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
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to request withdrawal.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to request withdrawal.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const reviewWithdrawal = async () => {
    if (!reviewing) return;
    setBusy(true);
    const labels = { approve: 'Approving withdrawal…', reject: 'Rejecting withdrawal…', pay: 'Marking as paid…' };
    const toastId = toast.loading(labels[reviewing.action] || 'Processing…');
    try {
      const res = await axiosSecure.patch('/api/admin/withdrawals', {
        withdrawalId: reviewing.withdrawal.id,
        action: reviewing.action,
        note: reviewing.action === 'reject' ? reviewNote : undefined,
        paymentMethod: reviewing.action === 'pay' ? payMethod : undefined,
        paymentReference: reviewing.action === 'pay' ? payReference : undefined,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Withdrawal reviewed.', { id: toastId });
        setReviewing(null);
        setReviewNote('');
        setPayReference('');
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to review withdrawal.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to review withdrawal.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  /** Record a Head Office / East London payout (single step, booked as PAID). */
  const recordCompanyPayout = async () => {
    const balance = (data?.company || []).find((a) => a.account === companyAccount);
    const amount = Number(companyAmount);

    if (!companyAccount || !balance) {
      toast.error('Choose a branch account.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payout amount.');
      return;
    }
    if (amount > balance.withdrawable + 0.001) {
      toast.error(
        `${balance.label} can only release ${money(Math.max(0, balance.withdrawable))} right now.`
      );
      return;
    }

    setBusy(true);
    const toastId = toast.loading('Recording payout…');
    try {
      const res = await axiosSecure.post('/api/admin/company-withdrawals', {
        account: companyAccount,
        amount,
        paymentMethod: companyMethod,
        paymentReference: companyRef,
        note: companyNote,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Payout recorded.', { id: toastId });
        setCompanyAccount(null);
        setCompanyAmount('');
        setCompanyRef('');
        setCompanyNote('');
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to record payout.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to record payout.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  /** Undo a branch payout recorded by mistake and release the money again. */
  const reverseCompanyPayout = async () => {
    if (!reversingPayout) return;
    setBusy(true);
    const toastId = toast.loading('Reversing payout…');
    try {
      const res = await axiosSecure.patch('/api/admin/company-withdrawals', {
        withdrawalId: reversingPayout.id,
        action: 'reverse',
        reason: reverseReason.trim() || undefined,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Payout reversed.', { id: toastId });
        setReversingPayout(null);
        setReverseReason('');
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to reverse payout.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reverse payout.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    // The admin view shows a much larger stat grid than the caseworker view, so
    // the placeholder mirrors whichever one is about to render.
    return <PageSkeleton stats={isAdmin ? 8 : 4} charts={2} chartVariant="donut" />;
  }

  const summary = data?.summary || {};
  const withdrawals = data?.withdrawals || [];
  const byCase = data?.byCase || [];
  const byHandler = data?.byHandler || [];
  const activity = data?.activity || [];

  // Branch accounts (admin only) and the payout ledger split.
  const companyAccounts = data?.company || [];
  const companyBalances = Object.fromEntries(companyAccounts.map((a) => [a.account, a]));

  const accountBadge = {
    HQ: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
    EL: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    HANDLER: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  };
  const accountLabel = { HQ: 'Head Office', EL: 'East London', HANDLER: 'Caseworker' };

  const wdFiltered = withdrawals.filter((w) => {
    if (wdAccountFilter === 'ALL') return true;
    return w.account === wdAccountFilter;
  });

  // ---- Withdrawal request modal (caseworker) -------------------------------
  const withdrawModal = showWithdraw && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowWithdraw(false)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Request Withdrawal</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Available to withdraw:{' '}
          <strong className="text-emerald-600 dark:text-emerald-400">{money(summary.withdrawable)}</strong>
        </p>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
          Amount (£) *
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Funds leave your wallet only after the admin approves the request and confirms the payment.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => setShowWithdraw(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            Cancel
          </button>
          <button type="button" onClick={requestWithdrawal} disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50">
            {busy ? (
              <>
                <Spinner size={14} className="mr-2" />
                Requesting…
              </>
            ) : (
              'Request Withdrawal'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Admin review modal --------------------------------------------------
  const reviewModal = reviewing && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReviewing(null)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {reviewing.action === 'approve'
            ? 'Approve Withdrawal'
            : reviewing.action === 'pay'
            ? 'Mark Withdrawal as Paid'
            : 'Reject Withdrawal'}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {reviewing.withdrawal.caseworkerName} — <strong>{money(reviewing.withdrawal.amount)}</strong>
        </p>
        {reviewing.action === 'reject' && (
          <div className="mt-4">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Note (optional)</label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              placeholder="Reason for rejecting…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}
        {reviewing.action === 'approve' && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
            Approving verifies the request and reserves the amount. The wallet is reduced only when you
            mark it as paid.
          </p>
        )}

        {reviewing.action === 'pay' && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Other'].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Payment Reference</label>
              <input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="e.g. Faster payment ref"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Confirming marks the withdrawal PAID and deducts the amount from the caseworker wallet.
            </p>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => setReviewing(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            Cancel
          </button>
          <button
            type="button"
            onClick={reviewWithdrawal}
            disabled={busy}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
              reviewing.action === 'approve'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : reviewing.action === 'pay'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {busy ? (
              <>
                <Spinner size={14} className="mr-2" />
                Processing…
              </>
            ) : reviewing.action === 'approve' ? (
              'Approve'
            ) : reviewing.action === 'pay' ? (
              'Confirm Paid'
            ) : (
              'Reject'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Branch payout modal (admin, recorded straight as PAID) --------------
  const companyBalance = companyAccount ? companyBalances[companyAccount] : null;

  const companyWithdrawModal = companyAccount && companyBalance && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setCompanyAccount(null)}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Withdraw from {companyBalance.label}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Available:{' '}
          <strong className="text-emerald-600 dark:text-emerald-400">
            {money(Math.max(0, companyBalance.withdrawable))}
          </strong>
        </p>

        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
          Amount (£)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={companyAmount}
            onChange={(e) => setCompanyAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() =>
              setCompanyAmount(String(round2(Math.max(0, companyBalance.withdrawable))))
            }
            className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Full
          </button>
        </div>

        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">
          Payment Method
        </label>
        <select
          value={companyMethod}
          onChange={(e) => setCompanyMethod(e.target.value)}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Direct Debit', 'Other'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">
          Payment Reference
        </label>
        <input
          value={companyRef}
          onChange={(e) => setCompanyRef(e.target.value)}
          placeholder="e.g. Faster payment ref"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">
          Note (optional)
        </label>
        <input
          value={companyNote}
          onChange={(e) => setCompanyNote(e.target.value)}
          placeholder="e.g. Monthly branch drawing"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <p className="mt-3 text-[11px] text-gray-400">
          Recorded immediately as paid against {companyBalance.label}. Reverse it afterwards if it
          was entered by mistake.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setCompanyAccount(null)}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={recordCompanyPayout}
            disabled={busy}
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <>
                <Spinner size={14} className="mr-2" />
                Recording…
              </>
            ) : (
              'Record Payout'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Reverse a branch payout --------------------------------------------
  const reversePayoutModal = reversingPayout && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setReversingPayout(null)}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Reverse Branch Payout
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {reversingPayout.caseworkerName} — {money(reversingPayout.amount)} on{' '}
          {fmtDate(reversingPayout.paidAt || reversingPayout.requestedAt)}
        </p>

        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
          Reason (optional)
        </label>
        <textarea
          rows={3}
          value={reverseReason}
          onChange={(e) => setReverseReason(e.target.value)}
          placeholder="e.g. Duplicate entry / wrong branch"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          Reversing releases the amount back into the branch balance. The payout stays in the ledger
          as REJECTED for the audit trail.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setReversingPayout(null)}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={reverseCompanyPayout}
            disabled={busy}
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <>
                <Spinner size={14} className="mr-2" />
                Reversing…
              </>
            ) : (
              'Reverse Payout'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // ---- ADMIN view ---------------------------------------------------------
  if (isAdmin) {
    const adminCards = [
      { label: 'Total Received', value: summary.totalReceived, icon: ArrowUpCircle, tone: 'text-gray-900 dark:text-gray-100' },
      { label: 'Total VAT', value: summary.totalVat, tone: 'text-gray-600 dark:text-gray-400' },
      { label: 'Total Net', value: summary.totalNet, tone: 'text-emerald-600 dark:text-emerald-400' },
      { label: 'Paid Out', value: summary.totalWithdrawn, icon: ArrowDownCircle, tone: 'text-orange-600 dark:text-orange-400' },
      { label: 'Reserved for Payouts', value: summary.totalReserved, tone: 'text-amber-600 dark:text-amber-400' },
      { label: 'Head Office Share', value: summary.totalHq, tone: 'text-indigo-600 dark:text-indigo-400' },
      { label: 'East London Share', value: summary.totalEl, tone: 'text-amber-600 dark:text-amber-400' },
      { label: 'Head Office Available', value: companyBalances.HQ?.withdrawable, tone: 'text-indigo-600 dark:text-indigo-400' },
      { label: 'East London Available', value: companyBalances.EL?.withdrawable, tone: 'text-amber-600 dark:text-amber-400' },
      { label: 'Branch Payouts', value: summary.totalWithdrawnCompany, tone: 'text-orange-600 dark:text-orange-400' },
      { label: 'Awaiting Review', value: summary.pendingWithdrawals, tone: 'text-blue-600 dark:text-blue-400', plain: true },
      { label: 'Approved — To Pay', value: summary.approvedWithdrawals, tone: 'text-blue-600 dark:text-blue-400', plain: true },
      { label: 'Payments Pending Approval', value: summary.pendingPayments, tone: 'text-amber-600 dark:text-amber-400', plain: true },
      { label: 'Cases', value: summary.caseCount, tone: 'text-gray-900 dark:text-gray-100', plain: true },
    ];

    // ---- firm-wide analytics ------------------------------------------------
    // Net profit buckets: exactly what the profit-split produced, so the donut
    // ties back to Total Net without double counting.
    const splitBuckets = [
      { name: 'Caseworkers', value: summary.totalHandler || 0, color: SPLIT_COLORS[0] },
      { name: 'Head Office', value: summary.totalHq || 0, color: SPLIT_COLORS[1] },
      { name: 'East London', value: summary.totalEl || 0, color: SPLIT_COLORS[2] },
    ];
    const splitTotal = splitBuckets.reduce((s, b) => s + b.value, 0);

    // Counts (not amounts) so the pipeline is readable even when a single
    // request dominates the money.
    const withdrawalCounts = withdrawals.reduce((acc, w) => {
      acc[w.status] = (acc[w.status] || 0) + 1;
      return acc;
    }, {});
    const pipelineBars = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'].map((status) => ({
      label: humanizeStatus(status),
      count: withdrawalCounts[status] || 0,
      color: WITHDRAWAL_STATUS_COLORS[status],
    }));

    const topEarners = [...byHandler]
      .sort((a, b) => (b.handlerShare || 0) - (a.handlerShare || 0))
      .slice(0, 6)
      .map((h) => ({ label: h.handlerName || '—', value: h.handlerShare || 0 }));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {adminCards.map(({ label, value, icon, tone, plain }) => (
            <StatCard key={label} label={label} value={value} tone={tone} icon={icon} plain={plain} />
          ))}
        </div>

        {/* Branch accounts: company money the firm can pay out itself. */}
        <SectionCard
          title="Branch Accounts"
          subtitle="Head Office & East London money available to withdraw"
        >
          {companyAccounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No branch balances yet.</p>
          ) : (
            <div className="space-y-2">
              {companyAccounts.map((a) => {
                const Icon = a.account === 'HQ' ? Building2 : Landmark;
                const available = Math.max(0, a.withdrawable);
                return (
                  <div
                    key={a.account}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.label}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Earned {money(a.earned)} · Paid out {money(a.paid)}
                          {a.payoutCount
                            ? ` (${a.payoutCount} payout${a.payoutCount === 1 ? '' : 's'})`
                            : ''}
                        </p>
                        {a.withdrawable < -0.001 && (
                          <p className="mt-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            Over-paid by {money(Math.abs(a.withdrawable))} — a voided payment removed
                            money that had already been withdrawn.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {money(available)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCompanyAccount(a.account);
                          setCompanyAmount(String(round2(available)));
                          setCompanyRef('');
                          setCompanyNote('');
                        }}
                        disabled={available <= 0}
                        title={
                          available <= 0
                            ? `${a.label} has nothing available to withdraw`
                            : `Withdraw from ${a.label}`
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-[#080B1A] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Withdraw
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* ---------------- firm-wide analytics ---------------- */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Profit Split"
            subtitle="Net distributed across the firm"
            skeleton="donut"
            empty={splitTotal <= 0}
            emptyText="No profit distributed yet."
          >
            <DonutBreakdown
              data={splitBuckets}
              centerLabel="Net"
              centerValue={money(summary.totalNet)}
            />
          </ChartCard>

          <ChartCard
            title="Payout Pipeline"
            subtitle="Withdrawal requests by status"
            skeleton="bars"
            empty={withdrawals.length === 0}
            emptyText="No withdrawal requests yet."
          >
            <BarBreakdown
              data={pipelineBars}
              series={[{ key: 'count', name: 'Requests' }]}
              colorful
              countMode
            />
          </ChartCard>
        </div>

        <ChartCard
          title="Top Caseworkers"
          subtitle="Handler share earned, highest first"
          skeleton="bars"
          empty={topEarners.length === 0}
          emptyText="No earnings recorded yet."
        >
          <BarBreakdown
            data={topEarners}
            layout="vertical"
            colorful
            colors={[CHART_COLORS.violet]}
            series={[{ key: 'value', name: 'Earned' }]}
          />
        </ChartCard>

        <SectionCard title="Withdrawal Requests" subtitle={`${wdFiltered.length} of ${withdrawals.length}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[
              { key: 'ALL', label: 'All' },
              { key: 'HANDLER', label: 'Caseworkers' },
              { key: 'HQ', label: 'Head Office' },
              { key: 'EL', label: 'East London' },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setWdAccountFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  wdAccountFilter === f.key
                    ? 'bg-[#080B1A] text-white border-[#080B1A]'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {wdFiltered.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {withdrawals.length === 0
                ? 'No withdrawal requests yet.'
                : 'No withdrawals match this filter.'}
            </p>
          ) : (
            <div className="space-y-2">
              {wdFiltered.map((w) => (
                <div key={w.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          accountBadge[w.account] || accountBadge.HANDLER
                        }`}
                      >
                        {accountLabel[w.account] || w.account}
                      </span>
                      {w.caseworkerName} — {money(w.amount)}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {fmtDate(w.requestedAt)}
                      {w.note ? ` — “${w.note}”` : ''}
                      {w.status === 'PAID' && w.paidAt ? ` — Paid ${fmtDate(w.paidAt)}` : ''}
                      {w.paymentReference ? ` — Ref: ${w.paymentReference}` : ''}
                      {w.reversedAt
                        ? ` — Reversed ${fmtDate(w.reversedAt)}${w.reversalReason ? `: ${w.reversalReason}` : ''}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={w.status} />
                    {w.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setReviewing({ withdrawal: w, action: 'approve' }); setReviewNote(''); }}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => { setReviewing({ withdrawal: w, action: 'reject' }); setReviewNote(''); }}
                          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {w.status === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={() => { setReviewing({ withdrawal: w, action: 'pay' }); setPayReference(''); }}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Mark as Paid
                      </button>
                    )}
                    {/* Branch payouts are booked straight as PAID, so the only corrective action is a reversal. */}
                    {w.status === 'PAID' && w.account && w.account !== 'HANDLER' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReversingPayout(w);
                          setReverseReason('');
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reverse
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Earnings by Caseworker" subtitle={`${byHandler.length} caseworkers`}>
          {byHandler.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No earnings recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <th className="py-2 pr-3 font-semibold">Caseworker</th>
                    <th className="py-2 pr-3 font-semibold">Cases</th>
                    <th className="py-2 pr-3 font-semibold text-right">Net</th>
                    <th className="py-2 pr-3 font-semibold text-right">Earned</th>
                    <th className="py-2 pr-3 font-semibold text-right">HQ</th>
                    <th className="py-2 pr-3 font-semibold text-right">EL</th>
                    <th className="py-2 pr-3 font-semibold text-right">Withdrawn</th>
                    <th className="py-2 font-semibold text-right">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  {byHandler.map((h) => (
                    <tr key={h.handlerId} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
                      <td className="py-3 pr-3 font-medium text-gray-900 dark:text-gray-100">{h.handlerName}</td>
                      <td className="py-3 pr-3 text-gray-600 dark:text-gray-300">{h.caseCount}</td>
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(h.totalNet)}</td>
                      <td className="py-3 pr-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(h.handlerShare)}</td>
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(h.hqShare)}</td>
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(h.elShare)}</td>
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(h.withdrawn)}</td>
                      <td className="py-3 text-right text-amber-600 dark:text-amber-400">{money(h.reserved || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Earnings by Case" subtitle={`${byCase.length} cases`}>
          {byCase.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No case earnings recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                    <th className="py-2 pr-3 font-semibold">Case</th>
                    <th className="py-2 pr-3 font-semibold">Client</th>
                    <th className="py-2 pr-3 font-semibold">Handler</th>
                    <th className="py-2 pr-3 font-semibold text-right">Paid</th>
                    <th className="py-2 pr-3 font-semibold text-right">VAT</th>
                    <th className="py-2 font-semibold text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {byCase.map((c) => (
                    <tr key={c.caseId} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
                      <td className="py-3 pr-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{c.caseNumber}</span>
                        <span className="block text-[11px] text-gray-400">{c.caseTitle}</span>
                      </td>
                      <td className="py-3 pr-3 text-gray-600 dark:text-gray-300">{c.clientName || '—'}</td>
                      <td className="py-3 pr-3 text-gray-600 dark:text-gray-300">{c.handlerName || '—'}</td>
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(c.totalPaid)}</td>
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(c.vat)}</td>
                      <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(c.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {reviewModal}
        {companyWithdrawModal}
        {reversePayoutModal}
      </div>
    );
  }

  // ---- CASEWORKER view ----------------------------------------------------
  const activityPage = activity.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Where the earned money sits right now: available + reserved + already paid
  // out reconciles to totalEarned.
  const walletBuckets = [
    { name: 'Available', value: summary.available || 0, color: CHART_COLORS.emerald },
    { name: 'Reserved', value: summary.pendingWithdrawalTotal || 0, color: CHART_COLORS.amber },
    { name: 'Paid out', value: summary.totalWithdrawn || 0, color: CHART_COLORS.slate },
  ];
  const walletBucketsTotal = walletBuckets.reduce((s, b) => s + b.value, 0);

  const myPipelineBars = ['PENDING', 'APPROVED', 'PAID', 'REJECTED']
    .map((status) => ({
      label: humanizeStatus(status),
      count: withdrawals.filter((w) => w.status === status).length,
      color: WITHDRAWAL_STATUS_COLORS[status],
    }))
    .filter((b) => b.count > 0);

  const topEarningCases = [...byCase]
    .sort((a, b) => (b.handlerShare || 0) - (a.handlerShare || 0))
    .slice(0, 6)
    .map((c) => ({ label: c.caseNumber || '—', value: c.handlerShare || 0 }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowWithdraw(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <ArrowDownCircle className="h-4 w-4" /> Request Withdrawal
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Earned" value={summary.totalEarned} tone="text-emerald-600 dark:text-emerald-400" icon={ArrowUpCircle} />
        <StatCard label="Paid Out" value={summary.totalWithdrawn} tone="text-orange-600 dark:text-orange-400" icon={ArrowDownCircle} />
        <StatCard label="Available" value={summary.available} tone="text-gray-900 dark:text-gray-100" />
        <StatCard label="Reserved" value={summary.pendingWithdrawalTotal} tone="text-amber-600 dark:text-amber-400" />
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Withdrawable now:{' '}
        <strong className="text-emerald-600 dark:text-emerald-400">{money(summary.withdrawable)}</strong>{' '}
        (reserved requests are held back until the admin marks them as paid)
      </p>

      {/* ---------------- wallet analytics ---------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Wallet Position"
          subtitle="Where your earned money currently sits"
          skeleton="donut"
          empty={walletBucketsTotal <= 0}
          emptyText="No earnings recorded yet."
        >
          <DonutBreakdown
            data={walletBuckets}
            centerLabel="Earned"
            centerValue={money(summary.totalEarned)}
          />
        </ChartCard>

        <ChartCard
          title="Withdrawal Requests"
          subtitle="Your requests by status"
          skeleton="bars"
          empty={myPipelineBars.length === 0}
          emptyText="You have not requested a withdrawal yet."
        >
          <BarBreakdown
            data={myPipelineBars}
            series={[{ key: 'count', name: 'Requests' }]}
            colorful
            countMode
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Top Earning Cases"
        subtitle="Your share of each case, highest first"
        skeleton="bars"
        empty={topEarningCases.length === 0}
        emptyText="No approved payments yet."
      >
        <BarBreakdown
          data={topEarningCases}
          layout="vertical"
          colorful
          colors={[CHART_COLORS.indigo]}
          series={[{ key: 'value', name: 'Your Share' }]}
        />
      </ChartCard>

      <SectionCard title="Earnings by Case" subtitle={`${summary.caseCount || 0} cases`}>
        {byCase.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No earnings recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                  <th className="py-2 pr-3 font-semibold">Case</th>
                  <th className="py-2 pr-3 font-semibold text-right">Paid</th>
                  <th className="py-2 pr-3 font-semibold text-right">Net</th>
                  <th className="py-2 font-semibold text-right">Your Share</th>
                </tr>
              </thead>
              <tbody>
                {byCase.map((c) => (
                  <tr key={c.caseId} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
                    <td className="py-3 pr-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{c.caseNumber}</span>
                      <span className="block text-[11px] text-gray-400">{c.caseTitle}</span>
                    </td>
                    <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(c.totalPaid)}</td>
                    <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(c.net)}</td>
                    <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(c.handlerShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Activity History" subtitle={`${activity.length} entries`}>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {activityPage.map((a) => (
                <div key={`${a.type}-${a.id}`} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {a.type === 'INCOME' ? (
                      <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-orange-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {a.type === 'INCOME' ? 'Payment received' : 'Withdrawal'}
                        {a.caseNumber ? ` — ${a.caseNumber}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-400">{fmtDate(a.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.status} />
                    <span
                      className={`text-sm font-semibold ${
                        a.type === 'INCOME'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : a.status === 'APPROVED' || a.status === 'PAID'
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {/* Only approved & paid withdrawals actually leave the wallet. */}
                      {a.type === 'INCOME' ? '+' : a.status === 'APPROVED' || a.status === 'PAID' ? '−' : ''}
                      {money(a.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} totalItems={activity.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </SectionCard>

      {withdrawModal}
    </div>
  );
}

