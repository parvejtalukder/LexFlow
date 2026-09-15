'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import { Wallet, TrendingUp, Building2, Landmark, Calculator } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { Skeleton } from '@/components/ui/Skeleton';
import ChartCard from '@/components/charts/ChartCard';
import AreaTrend from '@/components/charts/AreaTrend';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { CHART_COLORS } from '@/components/charts/chartTheme';

const PER_PAGE = 8;

const money = (v) => (v == null ? '—' : `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function Earnings() {
  const axiosSecure = useAxiosSecure();
  const [data, setData] = useState({ summary: {}, distributions: [] });
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [calcAmount, setCalcAmount] = useState('');
  const [calcVat, setCalcVat] = useState(false);
  // Exact projection returned by the server, tagged with the gross amount it was
  // computed for so a stale response can be ignored at render time.
  const [projectionResult, setProjectionResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/payments/earnings');
      if (res.data?.success) {
        setData({ summary: res.data.summary || {}, distributions: res.data.distributions || [] });
        setIsAdmin(!!res.data.isAdmin);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load earnings.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const distributions = data.distributions;
  const totalPages = Math.max(1, Math.ceil(distributions.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = distributions.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Revenue calculator — the typed figure is a gross amount when the "includes
  // VAT" box is ticked, otherwise it is a net amount that the client would be
  // invoiced plus 20% VAT.
  const handlerPercent = Number(data.summary.handlerPercent) || 0;
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

  // ---- chart data ----------------------------------------------------------
  // Net vs handler share for the last 6 months (bucketed client-side from the
  // ledger, which is already sorted newest-first).
  const earningsTrend = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString('default', { month: 'short' }),
        net: 0,
        handler: 0,
      });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const row of distributions) {
      if (!row.createdAt) continue;
      const dt = new Date(row.createdAt);
      const bucket = byKey.get(`${dt.getFullYear()}-${dt.getMonth()}`);
      if (!bucket) continue;
      bucket.net += Number(row.net) || 0;
      bucket.handler += Number(row.handlerAmount) || 0;
    }
    return buckets.map(({ key, ...rest }) => ({ ...rest, net: round2(rest.net), handler: round2(rest.handler) }));
  }, [distributions]);

  const trendSeries = [
    { key: 'net', name: 'Net Billed', color: CHART_COLORS.indigo },
    {
      key: 'handler',
      name: isAdmin ? 'Caseworker Share' : 'My Earnings',
      color: CHART_COLORS.emerald,
    },
  ];

  const hasTrend = earningsTrend.some((r) => r.net > 0 || r.handler > 0);

  const chartTotalNet = round2(data.summary.totalNet || 0);
  const chartTotalHandler = round2(data.summary.totalHandler || 0);

  // Admins see the three firm buckets; caseworkers see their own slice only.
  const splitData = isAdmin
    ? [
        { name: 'Head Office', value: round2(data.summary.totalHq || 0), color: CHART_COLORS.blue },
        { name: 'East London', value: round2(data.summary.totalEl || 0), color: CHART_COLORS.amber },
        { name: 'Caseworkers', value: chartTotalHandler, color: CHART_COLORS.emerald },
      ]
    : [
        { name: 'My Earnings', value: chartTotalHandler, color: CHART_COLORS.emerald },
        { name: 'Firm Share', value: round2(chartTotalNet - chartTotalHandler), color: CHART_COLORS.slate },
      ];

  const splitTotal = round2(splitData.reduce((sum, r) => sum + r.value, 0));

  const topCases = useMemo(() => {
    const map = new Map();
    for (const row of distributions) {
      const key = row.caseNumber || 'Unassigned';
      const entry = map.get(key) || { label: key, handler: 0, net: 0 };
      entry.handler += Number(row.handlerAmount) || 0;
      entry.net += Number(row.net) || 0;
      map.set(key, entry);
    }
    return [...map.values()]
      .map((r) => ({ label: r.label, value: round2(isAdmin ? r.net : r.handler) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [distributions, isAdmin]);

  const cards = [
    { label: 'Total Received (Net)', value: data.summary.totalNet, Icon: Wallet, tone: 'text-gray-900 dark:text-gray-100' },
    { label: 'My Earnings (Handler)', value: data.summary.totalHandler, Icon: TrendingUp, tone: 'text-emerald-600 dark:text-emerald-400' },
  ];

  // Head Office / East London splits are admin-only information.
  if (isAdmin) {
    cards.push(
      { label: 'Head Office Share', value: data.summary.totalHq, Icon: Building2, tone: 'text-blue-600 dark:text-blue-400' },
      { label: 'East London Share', value: data.summary.totalEl, Icon: Landmark, tone: 'text-amber-600 dark:text-amber-400' }
    );
  }

  const gridCols = isAdmin ? 'xl:grid-cols-4' : 'xl:grid-cols-2';


  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} gap-4`}>
        {cards.map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
              <Icon className="h-4 w-4 text-gray-400" />
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p className={`mt-2 text-2xl font-bold ${tone}`}>{money(value)}</p>
            )}
          </div>
        ))}
      </div>

      {/* ---------------- charts ---------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title={isAdmin ? 'Net Revenue Trend' : 'Earnings Trend'}
          subtitle={`Last ${earningsTrend.length || 6} months of activity`}
          className="lg:col-span-2"
          loading={loading}
          skeleton="area"
          empty={!hasTrend}
          emptyText="No distributions recorded yet."
        >
          <AreaTrend data={earningsTrend} series={trendSeries} />
        </ChartCard>

        <ChartCard
          title={isAdmin ? 'Profit Distribution' : 'Your Share of Net'}
          subtitle={isAdmin ? 'Net split across the firm' : 'Earnings vs firm share'}
          loading={loading}
          skeleton="donut"
          empty={splitTotal <= 0}
          emptyText="Nothing distributed yet."
        >
          <DonutBreakdown
            data={splitData}
            centerLabel="Net"
            centerValue={money(data.summary.totalNet)}
          />
        </ChartCard>
      </div>

      <ChartCard
        title={isAdmin ? 'Top Cases by Net' : 'Top Earning Cases'}
        subtitle={isAdmin ? 'Highest net amount per case' : 'Your share per case'}
        loading={loading}
        skeleton="bars"
        empty={topCases.length === 0}
        emptyText="No distributions recorded yet."
      >
        <BarBreakdown
          data={topCases}
          layout="vertical"
          colorful
          colors={isAdmin ? [CHART_COLORS.indigo] : [CHART_COLORS.emerald]}
          series={[{ key: 'value', name: isAdmin ? 'Net Amount' : 'My Earnings' }]}
        />
      </ChartCard>

      {/* Revenue calculator: project the handler share of a case amount. */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
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

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'VAT (20%)', value: calcVatAmount },
            { label: 'Net Amount', value: calcNet },
            { label: `Your Share (${handlerPercent}%)`, value: calcHandler, tone: 'text-emerald-600 dark:text-emerald-400' },
            { label: `Firm Share (${round2(100 - handlerPercent)}%)`, value: calcFirm },
          ].map(({ label, value, tone }) => (
            <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2">
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

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Case</th>
                <th className="px-4 py-3 font-semibold">Net</th>
                <th className="px-4 py-3 font-semibold">Rate</th>
                <th className="px-4 py-3 font-semibold">My Earnings</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={5} rows={8} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">No earnings yet.</td>
                </tr>
              ) : (
                paginated.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-gray-100 dark:border-gray-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{d.caseNumber || '—'}</p>
                      <p className="text-[11px] text-gray-400">{d.handlerName || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{money(d.net)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {isAdmin
                        ? `${d.handlerParcentage}% / ${d.hqParcentage}% / ${d.elParcentage}%`
                        : `${d.handlerParcentage}%`}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{money(d.handlerAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={safePage} totalItems={distributions.length} perPage={PER_PAGE} onChange={setPage} />
    </div>
  );
}
