'use client';

import { useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import { ArrowDownCircle, Banknote, Building2, Check, Landmark, RotateCcw, X } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import ChartCard from '@/components/charts/ChartCard';
import BarBreakdown from '@/components/charts/BarBreakdown';
import useWalletData from '@/hooks/useWalletData';
import {
  FilterChip,
  PER_PAGE,
  SearchInput,
  SectionCard,
  StatCard,
  StatusBadge,
  accountBadge,
  accountLabel,
  fmtDate,
  matchesQuery,
  money,
  pipelineBars,
  round2,
} from '@/components/dashboard/wallet/WalletUI';

/**
 * The firm's payout desk: every withdrawal request (caseworker wallets and the
 * Head Office / East London branch accounts) in one reviewed list, plus the
 * forms that approve, reject, mark as paid or reverse a payout.
 *
 * Admins only — `/api/admin/withdrawals` and `/api/admin/company-withdrawals`
 * both answer 403 to anyone else.
 */
export default function WithdrawalRequests() {
  const axiosSecure = useAxiosSecure();
  const { data, loading, reload } = useWalletData({
    failureMessage: 'Failed to load withdrawal requests.',
  });

  const [busy, setBusy] = useState(false);

  const [reviewing, setReviewing] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payReference, setPayReference] = useState('');

  // ---- Branch (Head Office / East London) payouts --------------------------
  const [companyAccount, setCompanyAccount] = useState(null); // 'HQ' | 'EL' | null
  const [companyAmount, setCompanyAmount] = useState('');
  const [companyMethod, setCompanyMethod] = useState('Bank Transfer');
  const [companyRef, setCompanyRef] = useState('');
  const [companyNote, setCompanyNote] = useState('');
  const [reversingPayout, setReversingPayout] = useState(null);
  const [reverseReason, setReverseReason] = useState('');

  const [accountFilter, setAccountFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

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
        await reload();
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
        await reload();
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
        await reload();
      } else {
        toast.error(res.data?.error || 'Failed to reverse payout.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reverse payout.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };
if (loading) return <PageSkeleton stats={4} charts={1} chartVariant="bars" table />;

  const summary = data?.summary || {};
  const withdrawals = data?.withdrawals || [];
  const companyAccounts = data?.company || [];
  const companyBalances = Object.fromEntries(companyAccounts.map((a) => [a.account, a]));

  // Counts (not amounts) so the pipeline is readable even when a single
  // request dominates the money.
  const bars = pipelineBars(withdrawals);

  const filtered = withdrawals.filter((w) => {
    if (accountFilter !== 'ALL' && w.account !== accountFilter) return false;
    return matchesQuery(query, [
      w.caseworkerName,
      w.amount,
      w.status,
      w.note,
      w.paymentReference,
      w.reversalReason,
      accountLabel[w.account] || w.account,
    ]);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const cards = [
    { label: 'Awaiting Review', value: summary.pendingWithdrawals, tone: 'text-blue-600 dark:text-blue-400', plain: true },
    { label: 'Approved — To Pay', value: summary.approvedWithdrawals, tone: 'text-blue-600 dark:text-blue-400', plain: true },
    { label: 'Paid Out', value: summary.totalWithdrawn, icon: ArrowDownCircle, tone: 'text-orange-600 dark:text-orange-400' },
    { label: 'Branch Payouts', value: summary.totalWithdrawnCompany, icon: Banknote, tone: 'text-orange-600 dark:text-orange-400' },
  ];

  const companyBalance = companyAccount ? companyBalances[companyAccount] : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, tone, icon, plain }) => (
          <StatCard key={label} label={label} value={value} tone={tone} icon={icon} plain={plain} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <ChartCard
          title="Payout Pipeline"
          subtitle="Withdrawal requests by status"
          skeleton="bars"
          empty={withdrawals.length === 0}
          emptyText="No withdrawal requests yet."
        >
          <BarBreakdown
            data={bars}
            series={[{ key: 'count', name: 'Requests' }]}
            colorful
            countMode
          />
        </ChartCard>
      </div>

      <SectionCard title="Withdrawal Requests" subtitle={`${filtered.length} of ${withdrawals.length}`}>
        <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'ALL', label: 'All' },
              { key: 'HANDLER', label: 'Caseworkers' },
              { key: 'HQ', label: 'Head Office' },
              { key: 'EL', label: 'East London' },
            ].map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                active={accountFilter === f.key}
                onClick={() => {
                  setAccountFilter(f.key);
                  setPage(1);
                }}
              />
            ))}
          </div>
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search caseworker, reference, note…"
            className="sm:ml-auto sm:w-72"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {withdrawals.length === 0
              ? 'No withdrawal requests yet.'
              : 'No withdrawals match this filter.'}
          </p>
        ) : (
          <div className="space-y-2">
            {paginated.map((w) => (
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

        <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </SectionCard>

      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReviewing(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
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
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
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
      )}

      {companyAccount && companyBalance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCompanyAccount(null)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
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

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
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
      )}

      {reversingPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setReversingPayout(null)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
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

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
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
      )}
    </div>
  );
}