'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Building2,
  Calculator,
  Landmark,
} from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import ChartCard from '@/components/charts/ChartCard';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { CHART_COLORS } from '@/components/charts/chartTheme';
import useWalletData from '@/hooks/useWalletData';
import {
  PER_PAGE,
  SearchInput,
  SectionCard,
  StatCard,
  matchesQuery,
  money,
  pipelineBars,
  round2,
} from '@/components/dashboard/wallet/WalletUI';

/**
 * My Wallet / Wallet.
 *
 * Admins get the firm-wide totals and the read-only branch balances — money is
 * paid out from `/dashboard/withdrawal-requests`, and per-caseworker /
 * per-case earnings live on their own pages.
 *
 * A caseworker gets their own balance, the revenue calculator and the
 * per-payment ledger of what each approved payment earned them.
 */
export default function Wallet() {
  const axiosSecure = useAxiosSecure();
  const { data, loading, isAdmin, reload } = useWalletData();

  const [busy, setBusy] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  // ---- revenue calculator (caseworker) --------------------------------------
  const [calcAmount, setCalcAmount] = useState('');
  const [calcVat, setCalcVat] = useState(false);
  // Exact projection returned by the server, tagged with the gross amount it was
  // computed for so a stale response can be ignored at render time.
  const [projectionResult, setProjectionResult] = useState(null);

  // ---- recent earnings ledger (caseworker) ----------------------------------
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [page, setPage] = useState(1);

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

  // Revenue calculator — the typed figure is a gross amount when the "includes
  // VAT" box is ticked, otherwise it is a net amount that the client would be
  // invoiced plus 20% VAT.
  const handlerPercent = Number(data?.summary?.handlerPercent) || 0;
  const entered = Number(calcAmount) || 0;
  const calcGross = calcVat ? round2(entered) : round2(entered * 1.2);
  // The server projection below runs the real VAT -> resolveSplit -> distribute
  // chain; these local figures only drive the first paint and the offline
  // fallback, because applying one percentage to the net can drift a penny from
  // the largest-remainder allocation that approval actually freezes.
  // A projection is trusted only when it was computed for the amount currently
  // typed, so the previous one is dropped as soon as the input changes.
  const projection = entered > 0 && projectionResult?.gross === calcGross ? projectionResult : null;
  const localNet = calcVat ? round2(entered * (100 / 120)) : round2(entered);
  const localHandler = round2((localNet * handlerPercent) / 100);
  const calcNet = projection ? projection.net : localNet;
  // The VAT tile is derived as the residual so VAT + Net always adds up to the
  // amount typed. calculateVatAndNet() rounds the two independently, which can
  // differ by a penny on some amounts (see the VAT rounding note).
  const calcVatAmount = round2(calcGross - calcNet);
  const calcHandler = projection ? projection.handlerShare : localHandler;
  const calcFirm = projection ? projection.firmShare : round2(localNet - localHandler);

  // Ask the server for the penny-accurate projection, debounced so typing does
  // not fire a request per keystroke. Only totals come back: caseworkers still
  // never learn how the remainder splits between HQ and East London.
  useEffect(() => {
    if (!(entered > 0)) return undefined;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await axiosSecure.get(`/api/payments/earnings?project=${calcGross}&vat=1`);
        if (cancelled) return;
        const p = res.data?.projection;
        setProjectionResult(p ? { ...p, gross: calcGross } : null);
      } catch (err) {
        console.error(err);
        if (!cancelled) setProjectionResult(null);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [axiosSecure, calcGross, entered]);

  if (loading) {
    // The admin view shows a much larger stat grid than the caseworker view, so
    // the placeholder mirrors whichever one is about to render.
    return <PageSkeleton stats={isAdmin ? 8 : 4} charts={2} chartVariant="donut" />;
  }

  const summary = data?.summary || {};

  // ---- ADMIN view ----------------------------------------------------------
  if (isAdmin) {
    const companyAccounts = data?.company || [];
    const companyBalances = Object.fromEntries(companyAccounts.map((a) => [a.account, a]));

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

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {adminCards.map(({ label, value, icon, tone, plain }) => (
            <StatCard key={label} label={label} value={value} tone={tone} icon={icon} plain={plain} />
          ))}
        </div>

        {/* Branch accounts: read-only here — the payout form and the review
            queue both live on Withdrawal Requests, so money only leaves the
            firm's accounts from one audited place. */}
        <SectionCard
          title="Branch Accounts"
          subtitle="Head Office & East London money available to withdraw"
          actions={
            <Link
              href="/dashboard/withdrawal-requests"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              <Banknote className="h-3.5 w-3.5" /> Manage payouts
            </Link>
          }
        >
          {companyAccounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No branch balances yet.</p>
          ) : (
            <div className="space-y-2">
              {companyAccounts.map((a) => {
                const Icon = a.account === 'HQ' ? Building2 : Landmark;
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
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {money(Math.max(0, a.withdrawable))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Link
            href="/dashboard/earnings-by-caseworker"
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-800"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Earnings by Caseworker</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Handler share, branch splits, withdrawals and reservations for every caseworker.
            </p>
          </Link>
          <Link
            href="/dashboard/earnings-by-case"
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-800"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Earnings by Case</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              What each case billed and what it distributed across the firm.
            </p>
          </Link>
          <Link
            href="/dashboard/withdrawal-requests"
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-800"
          >
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Withdrawal Requests</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Review, approve, pay and reverse payouts — caseworker wallets and branch accounts.
            </p>
          </Link>
        </div>

      </div>
    );
  }

  // ---- CASEWORKER view ----------------------------------------------------
  const withdrawals = data?.withdrawals || [];
  const distributions = data?.distributions || [];

  // Where the earned money sits right now: available + reserved + already paid
  // out reconciles to totalEarned.
  const walletBuckets = [
    { name: 'Available', value: summary.available || 0, color: CHART_COLORS.emerald },
    { name: 'Reserved', value: summary.pendingWithdrawalTotal || 0, color: CHART_COLORS.amber },
    { name: 'Paid out', value: summary.totalWithdrawn || 0, color: CHART_COLORS.slate },
  ];
  const walletBucketsTotal = walletBuckets.reduce((s, b) => s + b.value, 0);

  const myPipelineBars = pipelineBars(withdrawals).filter((b) => b.count > 0);

  // ---- per-payment earnings ledger ----------------------------------------
  // One row per approved payment, showing the net that was billed, the rate the
  // profit-split applied and what that put in this wallet.
  const ledgerFiltered = distributions.filter((d) =>
    matchesQuery(ledgerQuery, [
      d.caseNumber,
      d.net,
      d.handlerAmount,
      d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '',
    ])
  );
  const ledgerPages = Math.max(1, Math.ceil(ledgerFiltered.length / PER_PAGE));
  const safePage = Math.min(page, ledgerPages);
  const recentPage = ledgerFiltered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const earningsTiles = [
    { label: 'Cases with earnings', value: summary.caseCount ?? '—' },
    { label: 'Approved payments', value: summary.paymentCount ?? '—' },
    { label: 'Your share rate', value: `${round2(handlerPercent)}%` },
    { label: 'Total earned', value: money(summary.totalEarned) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Withdrawable now:{' '}
          <strong className="text-emerald-600 dark:text-emerald-400">{money(summary.withdrawable)}</strong>{' '}
          (reserved requests are held back until the admin marks them as paid)
        </p>
        <button
          type="button"
          onClick={() => setShowWithdraw(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <ArrowDownCircle className="h-4 w-4" /> Request Withdrawal
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Earned" value={summary.totalEarned} tone="text-emerald-600 dark:text-emerald-400" icon={ArrowUpCircle} />
        <StatCard label="Paid Out" value={summary.totalWithdrawn} tone="text-orange-600 dark:text-orange-400" icon={ArrowDownCircle} />
        <StatCard label="Available" value={summary.available} tone="text-gray-900 dark:text-gray-100" />
        <StatCard label="Reserved" value={summary.pendingWithdrawalTotal} tone="text-amber-600 dark:text-amber-400" />
      </div>

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

      <SectionCard title="Earnings Summary" subtitle="Your share of every approved payment">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {earningsTiles.map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2"
            >
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Revenue calculator: project the handler share of a case amount. */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Calculator className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Revenue Calculator</h2>
          <span className="ml-auto rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            Your share: {handlerPercent}%
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Amount (£)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              placeholder="e.g. 2400"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={calcVat}
                onChange={(e) => setCalcVat(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Amount already includes 20% VAT
            </label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'VAT (20%)', value: calcVatAmount },
            { label: 'Net Amount', value: calcNet },
            { label: `Your Share (${handlerPercent}%)`, value: calcHandler, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: `Firm Share (${round2(100 - handlerPercent)}%)`, value: calcFirm },
          ].map(({ label, value, tone }) => (
            <div
              key={label}
              className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2"
            >
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`mt-1 text-base font-semibold ${tone || 'text-gray-900 dark:text-gray-100'}`}>
                {entered > 0 ? money(value) : '—'}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          Projection only, and exact to the penny: it runs the same VAT and profit-split maths that
          approval freezes onto the payment. Earnings land in your wallet once an admin approves the
          matching payment — a case settled in part-payments is allocated payment by payment.
        </p>
      </div>

      <SectionCard
        title="Recent Earnings"
        subtitle={`${ledgerFiltered.length} of ${distributions.length}`}
        actions={
          <SearchInput
            value={ledgerQuery}
            onChange={(v) => {
              setLedgerQuery(v);
              setPage(1);
            }}
            placeholder="Search case or date…"
            className="w-56"
          />
        }
      >
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Recent earnings table, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                <th className="py-3 pr-4 font-semibold">Date</th>
                <th className="py-3 pr-4 font-semibold">Case</th>
                <th className="py-3 pr-4 font-semibold text-right">Net</th>
                <th className="py-3 pr-4 font-semibold text-right">Rate</th>
                <th className="py-3 font-semibold text-right">My Earnings</th>
              </tr>
            </thead>
            <tbody>
              {recentPage.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    {distributions.length === 0 ? 'No earnings yet.' : 'No earnings match this search.'}
                  </td>
                </tr>
              ) : (
                recentPage.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-gray-100 dark:border-gray-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="py-3 pr-4 text-gray-500 dark:text-gray-400">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 pr-4 font-medium text-gray-900 dark:text-gray-100">
                      {d.caseNumber || '—'}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600 dark:text-gray-300">{money(d.net)}</td>
                    <td className="py-3 pr-4 text-right text-gray-600 dark:text-gray-300">
                      {d.handlerParcentage}%
                    </td>
                    <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {money(d.handlerAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={safePage} totalItems={ledgerFiltered.length} perPage={PER_PAGE} onChange={setPage} />
      </SectionCard>

      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowWithdraw(false)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
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
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
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
      )}
    </div>
  );
}