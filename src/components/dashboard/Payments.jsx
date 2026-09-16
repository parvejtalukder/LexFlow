'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import { Plus, Search, ReceiptText, Check, X, Ban } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import Spinner from '@/components/ui/Spinner';
import ChartCard from '@/components/charts/ChartCard';
import AreaTrend from '@/components/charts/AreaTrend';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import BarBreakdown from '@/components/charts/BarBreakdown';
import {
  CHART_COLORS,
  PAYMENT_STATUS_COLORS,
  humanizeStatus,
} from '@/components/charts/chartTheme';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const PER_PAGE = 10;

const emptyForm = {
  caseId: '',
  amount: '',
  reference: '',
  description: '',
  paymentMethod: 'Bank Transfer',
  receivedAt: '',
};

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Direct Debit', 'Other'];

const STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  VOIDED: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function StatusBadge({ status }) {
  const key = status || 'PENDING';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        STATUS_STYLES[key] || STATUS_STYLES.PENDING
      }`}
    >
      {key}
    </span>
  );
}

export default function Payments() {
  const axiosSecure = useAxiosSecure();
  const [payments, setPayments] = useState([]);
  const [cases, setCases] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  // Which row action is in flight, e.g. "approve:<paymentId>", so only the
  // clicked button shows a spinner while its request is running.
  const [busyAction, setBusyAction] = useState(null);
  const [showRecord, setShowRecord] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [rejecting, setRejecting] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentsRes, casesRes] = await Promise.all([
        axiosSecure.get('/api/payments'),
        axiosSecure.get('/api/cases'),
      ]);
      if (paymentsRes.data?.success) {
        setPayments(paymentsRes.data.payments || []);
        setIsAdmin(!!paymentsRes.data.isAdmin);
      }
      if (casesRes.data?.success) setCases(casesRes.data.cases || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const q = query.trim().toLowerCase();
  const searched = q
    ? payments.filter(
        (p) =>
          (p.caseNumber || '').toLowerCase().includes(q) ||
          (p.caseTitle || '').toLowerCase().includes(q) ||
          (p.clientName || '').toLowerCase().includes(q) ||
          (p.handlerName || '').toLowerCase().includes(q)
      )
    : payments;
  const filtered = statusFilter === 'ALL' ? searched : searched.filter((p) => (p.status || 'PENDING') === statusFilter);

  // Admin approval queue size (caseworkers only ever see their own rows).
  const pendingCount = payments.filter((p) => (p.status || 'PENDING') === 'PENDING').length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Per-case totals. APPROVED = money received; APPROVED + PENDING = committed
  // against the deal price (REJECTED/VOIDED release their reservation).
  const approvedByCase = {};
  const committedByCase = {};
  payments.forEach((p) => {
    if (p.status === 'REJECTED' || p.status === 'VOIDED') return;
    const amount = Number(p.amount) || 0;
    committedByCase[p.caseId] = (committedByCase[p.caseId] || 0) + amount;
    if (p.status === 'APPROVED') {
      approvedByCase[p.caseId] = (approvedByCase[p.caseId] || 0) + amount;
    }
  });
  const selectedCase = cases.find((c) => c.id === form.caseId);
  const selectedPaid = form.caseId ? approvedByCase[form.caseId] || 0 : 0;
  const selectedCommitted = form.caseId ? committedByCase[form.caseId] || 0 : 0;
  const selectedTotal = selectedCase
    ? selectedCase.totalAmount != null ? selectedCase.totalAmount : selectedCase.dealPrice
    : 0;
  const selectedRemaining = Math.max(0, selectedTotal - selectedCommitted);

  // ---- chart data ----------------------------------------------------------
  // Value received per month (APPROVED) alongside what is still awaiting
  // approval, bucketed from the rows the API already scoped to this user.
  const trend = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString('default', { month: 'short' }),
        received: 0,
        pending: 0,
      });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const p of payments) {
      const raw = p.receivedAt || p.createdAt;
      if (!raw) continue;
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) continue;
      const bucket = byKey.get(`${dt.getFullYear()}-${dt.getMonth()}`);
      if (!bucket) continue;
      const amount = Number(p.amount) || 0;
      if (p.status === 'APPROVED') bucket.received += amount;
      else if ((p.status || 'PENDING') === 'PENDING') bucket.pending += amount;
    }
    return months.map(({ key, ...rest }) => ({
      ...rest,
      received: round2(rest.received),
      pending: round2(rest.pending),
    }));
  }, [payments]);

  const hasTrend = trend.some((m) => m.received > 0 || m.pending > 0);

  // Where the money sits by status — amounts, so it reads like a ledger.
  const statusData = useMemo(
    () =>
      ['PENDING', 'APPROVED', 'REJECTED', 'VOIDED']
        .map((s) => ({
          name: humanizeStatus(s),
          value: round2(
            payments
              .filter((p) => (p.status || 'PENDING') === s)
              .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
          ),
          color: PAYMENT_STATUS_COLORS[s],
        }))
        .filter((d) => d.value > 0),
    [payments]
  );

  const topCases = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      if (p.status !== 'APPROVED') continue;
      const key = p.caseNumber || '—';
      map.set(key, round2((map.get(key) || 0) + (Number(p.amount) || 0)));
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [payments]);

  const trendSeries = [
    { key: 'received', name: 'Received', color: CHART_COLORS.emerald },
    { key: 'pending', name: 'Awaiting Approval', color: CHART_COLORS.amber },
  ];

  const recordPayment = async () => {
    if (!form.caseId || !form.amount) {
      toast.error('Case and amount are required.');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be a positive number.');
      return;
    }
    if (amount > selectedRemaining + 0.001) {
      toast.error(`This payment exceeds the remaining balance of ${money(selectedRemaining)}.`);
      return;
    }

    setBusy(true);
    const toastId = toast.loading('Submitting payment…');
    try {
      const res = await axiosSecure.post('/api/payments', {
        caseId: form.caseId,
        amount,
        reference: form.reference,
        description: form.description,
        paymentMethod: form.paymentMethod,
        receivedAt: form.receivedAt || undefined,
      });
      if (res.data?.success) {
        // Submissions never carry VAT/net — those are frozen on approval.
        toast.success(
          res.data?.pendingApproval
            ? 'Payment submitted. It will count once approved by an admin.'
            : 'Payment recorded.',
          { id: toastId }
        );
        setShowRecord(false);
        setForm(emptyForm);
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to submit payment.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to submit payment.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  // Admin: approve freezes VAT/net + creates the distribution; reject sends the
  // entry back with a reason; void cancels an approved payment and removes the
  // distribution so the money leaves the numbers again.
  const reviewPayment = async (payment, action, rejectionReason) => {
    const labels = { approve: 'Approving…', reject: 'Rejecting…', void: 'Voiding…' };
    setBusyAction(`${action}:${payment.id}`);
    setBusy(true);
    const toastId = toast.loading(labels[action] || 'Working…');
    try {
      const res = await axiosSecure.patch(`/api/payments/${payment.id}`, {
        action,
        rejectionReason: rejectionReason || undefined,
      });
      if (res.data?.success) {
        const messages = {
          approve: 'Payment approved. VAT, net and the profit split are now locked in.',
          reject: 'Payment rejected. The reserved amount has been released.',
          void: 'Payment voided. The profit distribution has been removed.',
        };
        toast.success(messages[action], { id: toastId });
        // The approve endpoint reports when the handler's stored percentages were
        // unset or did not total 100% and the role defaults were substituted, so
        // warn instead of letting the wrong split pass silently.
        if (action === 'approve' && res.data?.splitFallback) {
          const applied = res.data.appliedSplit || {};
          toast(
            `Split fallback applied (${applied.handlerParcentage}/${applied.hqParcentage}/${applied.elParcentage}): this handler's percentages are unset or do not total 100%.`,
            { icon: '⚠️', duration: 8000 }
          );
        }
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to review payment.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to review payment.', { id: toastId });
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const submitRejection = async () => {
    if (!rejecting) return;
    const target = rejecting;
    setRejecting(null);
    const reason = rejectReason.trim();
    setRejectReason('');
    await reviewPayment(target, 'reject', reason);
  };

  const money = (v) => (v == null ? '—' : `£${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'VOIDED'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition ${
              statusFilter === s
                ? 'bg-[#080B1A] text-white border-[#080B1A]'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {s === 'ALL' ? 'All' : s}
            {s === 'PENDING' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
        {isAdmin && pendingCount > 0 && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {pendingCount} awaiting your approval
          </span>
        )}
      </div>

      {/* Received vs awaiting approval, plus how the ledger splits by status. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={isAdmin ? 'Payment Trend' : 'My Payment Trend'}
          subtitle="Value received vs awaiting approval (last 6 months)"
          loading={loading}
          skeleton="area"
          empty={!hasTrend}
          emptyText="No payments recorded yet."
        >
          <AreaTrend data={trend} series={trendSeries} />
        </ChartCard>

        <ChartCard
          title="Payments by Status"
          subtitle="Submitted value per status"
          loading={loading}
          skeleton="donut"
          empty={statusData.length === 0}
          emptyText="No payments recorded yet."
        >
          <DonutBreakdown
            data={statusData}
            centerLabel="Payments"
            centerValue={money(
              round2(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0))
            )}
          />
        </ChartCard>
      </div>

      <ChartCard
        title={isAdmin ? 'Top Cases by Received Value' : 'My Top Cases'}
        subtitle="Approved value per case"
        loading={loading}
        skeleton="bars"
        empty={topCases.length === 0}
        emptyText="No approved payments yet."
      >
        <BarBreakdown
          data={topCases}
          layout="vertical"
          colorful
          colors={[CHART_COLORS.emerald]}
          series={[{ key: 'value', name: 'Received' }]}
        />
      </ChartCard>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} payment{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search case, client, handler…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowRecord(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#080B1A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> Submit Payment
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Payments table, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table className="w-full min-w-[1024px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Term</th>
                <th className="px-4 py-3 font-semibold">Case</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Received</th>
                <th className="px-4 py-3 font-semibold">VAT</th>
                <th className="px-4 py-3 font-semibold">Net</th>
                <th className="px-4 py-3 font-semibold">Handler</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                {isAdmin && <th className="px-4 py-3 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={isAdmin ? 10 : 9} rows={8} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 10 : 9} className="px-4 py-12 text-center text-gray-500">
                    <ReceiptText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No payments recorded.
                  </td>
                </tr>
              ) : (
                paginated.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 dark:border-gray-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {p.receivedAt ? new Date(p.receivedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        Term {p.termNumber || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{p.caseTitle || '—'}</p>
                      <p className="text-[11px] font-mono text-gray-400">{p.caseNumber}</p>
                      {p.reference && <p className="text-[11px] text-gray-400 italic">“{p.reference}”</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{p.clientName || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{money(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{money(p.vat)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{money(p.net)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {p.handlerName || '—'}
                      <p className="text-[10px] text-gray-400 capitalize">{p.handlerType}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                      {p.status === 'PENDING' && (
                        <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">Awaiting approval</p>
                      )}
                      {p.status === 'REJECTED' && p.rejectionReason && (
                        <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400" title={p.rejectionReason}>
                          {p.rejectionReason.length > 40 ? `${p.rejectionReason.slice(0, 40)}…` : p.rejectionReason}
                        </p>
                      )}
                      {p.paymentMethod && <p className="mt-1 text-[10px] text-gray-400">{p.paymentMethod}</p>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => reviewPayment(p, 'approve')}
                                title="Approve payment"
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {busyAction === `approve:${p.id}` ? (
                                  <Spinner size={12} />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}{' '}
                                {busyAction === `approve:${p.id}` ? 'Approving…' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setRejecting(p);
                                  setRejectReason('');
                                }}
                                title="Reject payment"
                                className="inline-flex items-center gap-1 rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/30 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 disabled:opacity-50"
                              >
                                {busyAction === `reject:${p.id}` ? (
                                  <Spinner size={12} />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}{' '}
                                {busyAction === `reject:${p.id}` ? 'Rejecting…' : 'Reject'}
                              </button>
                            </>
                          )}
                          {p.status === 'APPROVED' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => reviewPayment(p, 'void')}
                              title="Void this payment and remove its profit distribution"
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 disabled:opacity-50"
                            >
                              {busyAction === `void:${p.id}` ? (
                                <Spinner size={12} />
                              ) : (
                                <Ban className="h-3 w-3" />
                              )}{' '}
                              {busyAction === `void:${p.id}` ? 'Voiding…' : 'Void'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      {showRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRecord(false)} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Submit Payment</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Submissions are reviewed by an admin. VAT, net and the profit split are locked in only once
              the payment is approved.
            </p>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">Case *</label>
            <select
              value={form.caseId}
              onChange={(e) => set('caseId', e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select case…</option>
              {cases
                .filter((c) => c.status !== 'PENDING' && c.status !== 'REJECTED')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caseNumber} — {c.title}
                  </option>
                ))}
            </select>

            {selectedCase && (
              <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Deal Price (net)</span>
                  <span className="font-medium">{money(selectedCase.dealPrice)}</span>
                </div>
                {selectedCase.isVat && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>VAT (20%)</span>
                    <span className="font-medium">{money(selectedCase.vatAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100">
                  <span>Total to collect</span>
                  <span>{money(selectedTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                  <span>Paid to date</span>
                  <span className="font-medium">{money(selectedPaid)}</span>
                </div>
                {selectedCommitted > selectedPaid + 0.001 && (
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Awaiting approval</span>
                    <span className="font-medium">{money(selectedCommitted - selectedPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>Available to submit</span>
                  <span>{money(selectedRemaining)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Amount Received (£) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => set('amount', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Received Date</label>
                <input
                  type="date"
                  value={form.receivedAt}
                  onChange={(e) => set('receivedAt', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">Payment Method</label>
            <select
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">Description</label>
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="e.g. Initial deposit"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">Reference / Note</label>
            <input
              value={form.reference}
              onChange={(e) => set('reference', e.target.value)}
              placeholder="e.g. 2nd term — invoice #1024"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setShowRecord(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={recordPayment}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                {busy ? (
                  <>
                    <Spinner size={14} className="mr-2" />
                    Submitting…
                  </>
                ) : (
                  'Submit for Approval'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setRejecting(null);
              setRejectReason('');
            }}
          />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reject Payment</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {rejecting.caseNumber} — {money(rejecting.amount)}
            </p>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
              Reason (optional)
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Amount does not match the bank statement"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              The rejected amount is released back into the case&apos;s outstanding balance.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejecting(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRejection}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Rejecting…' : 'Reject Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

