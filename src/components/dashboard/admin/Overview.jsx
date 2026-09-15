'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import {
  Users,
  Inbox,
  Briefcase,
  CreditCard,
  Wallet,
  TrendingUp,
  Clock,
  ArrowUpRight,
} from 'lucide-react';

import StatCard from '@/components/dashboard/StatCard';
import Spinner from '@/components/ui/Spinner';
import ChartCard from '@/components/charts/ChartCard';
import AreaTrend from '@/components/charts/AreaTrend';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import BarBreakdown from '@/components/charts/BarBreakdown';
import {
  CASE_STATUS_COLORS,
  CHART_COLORS,
  PAYMENT_STATUS_COLORS,
  SPLIT_COLORS,
  humanizeStatus,
} from '@/components/charts/chartTheme';
import { formatCurrency, formatNumber } from '@/lib/format';

const EMPTY = {
  role: null,
  isAdmin: false,
  cards: {},
  revenueTrend: [],
  paymentStatus: [],
  caseStatus: [],
  topCases: [],
  topHandlers: [],
  splitBreakdown: [],
};

export default function DashboardOverview() {
  const { role } = useAuth();
  const axiosSecure = useAxiosSecure();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // The auth context gives us the right skeleton layout instantly; the API
  // response then becomes the source of truth (it also decides the scoping).
  const roleIsAdmin = String(role || '').toLowerCase() === 'admin';
  const isAdmin = data.role ? data.isAdmin : roleIsAdmin;

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await axiosSecure.get('/api/dashboard/stats');
        const payload = res.data;
        if (payload?.success) {
          setData({
            role: payload.role,
            isAdmin: !!payload.isAdmin,
            cards: payload.cards || {},
            revenueTrend: payload.revenueTrend || [],
            paymentStatus: payload.paymentStatus || [],
            caseStatus: payload.caseStatus || [],
            topCases: payload.topCases || [],
            topHandlers: payload.topHandlers || [],
            splitBreakdown: payload.splitBreakdown || [],
          });
        } else {
          setError('Unexpected response from the server.');
        }
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.error || 'Failed to load dashboard data.');
        if (!silent) toast.error('Failed to load dashboard.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [axiosSecure]
  );

  useEffect(() => {
    const id = setTimeout(() => load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const refresh = useCallback(() => load({ silent: true }), [load]);

  const { cards, revenueTrend, paymentStatus, caseStatus, topCases, topHandlers, splitBreakdown } = data;

  const trendSeries = isAdmin
    ? [
        { key: 'gross', name: 'Gross Received', color: CHART_COLORS.indigo },
        { key: 'net', name: 'Net Revenue', color: CHART_COLORS.emerald },
      ]
    : [
        { key: 'net', name: 'Net Billed', color: CHART_COLORS.indigo },
        { key: 'handler', name: 'My Earnings', color: CHART_COLORS.emerald },
      ];

  const hasTrend = useMemo(
    () => revenueTrend.some((r) => (r.gross || 0) > 0 || (r.net || 0) > 0 || (r.handler || 0) > 0),
    [revenueTrend]
  );

  const paymentStatusData = useMemo(
    () =>
      paymentStatus
        .filter((r) => r.count > 0)
        .map((r) => ({
          name: humanizeStatus(r.status),
          value: r.count,
          color: PAYMENT_STATUS_COLORS[r.status],
        })),
    [paymentStatus]
  );

  const paymentTotal = useMemo(
    () => paymentStatus.reduce((sum, r) => sum + (r.count || 0), 0),
    [paymentStatus]
  );

  const caseStatusData = useMemo(
    () =>
      caseStatus.map((r) => ({
        label: humanizeStatus(r.status),
        count: r.count || 0,
        color: CASE_STATUS_COLORS[r.status],
      })),
    [caseStatus]
  );

  const splitData = useMemo(
    () => splitBreakdown.map((r, i) => ({ ...r, color: SPLIT_COLORS[i % SPLIT_COLORS.length] })),
    [splitBreakdown]
  );

  const topCasesData = useMemo(
    () =>
      topCases.map((r) => ({
        label: r.caseNumber,
        value: (isAdmin ? r.net : r.handler) || 0,
        paid: r.totalPaid || 0,
      })),
    [topCases, isAdmin]
  );

  const topHandlersData = useMemo(
    () => topHandlers.map((r) => ({ label: r.handlerName, value: r.net || 0 })),
    [topHandlers]
  );

  const hasCaseStatus = useMemo(() => caseStatusData.some((r) => r.count > 0), [caseStatusData]);

  const adminCards = [
    {
      label: 'Total Users',
      value: formatNumber(cards.totalUsers),
      hint: `${formatNumber(cards.activeCaseworkers || 0)} caseworkers`,
      icon: Users,
      tint: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300',
    },
    {
      label: 'Pending Requests',
      value: formatNumber(cards.pendingRequests),
      hint: cards.pendingRequests > 0 ? 'needs review' : 'all clear',
      icon: Inbox,
      tint: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
    },
    {
      label: 'Active Cases',
      value: formatNumber(cards.activeCases),
      hint: `${formatNumber(cards.totalCases || 0)} total`,
      icon: Briefcase,
      tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300',
    },
    {
      label: 'Net Revenue (Month)',
      value: formatCurrency(cards.monthNet),
      hint: `${formatNumber(cards.monthPaymentCount || 0)} payments`,
      icon: CreditCard,
      tint: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300',
    },
  ];

  const caseworkerCards = [
    {
      label: 'My Cases',
      value: formatNumber(cards.myCases),
      hint: `${formatNumber(cards.activeCases || 0)} active`,
      icon: Briefcase,
      tint: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300',
    },
    {
      label: 'Available Balance',
      value: formatCurrency(cards.availableBalance),
      hint: `${formatCurrency(cards.withdrawable)} withdrawable`,
      icon: Wallet,
      tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300',
    },
    {
      label: 'My Earnings (Month)',
      value: formatCurrency(cards.monthEarnings),
      hint: `${formatNumber(cards.monthPaymentCount || 0)} payments`,
      icon: TrendingUp,
      tint: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300',
    },
    {
      label: 'Awaiting Approval',
      value: formatNumber(cards.pendingPayments),
      hint: `${formatNumber(cards.approvedPayments || 0)} approved`,
      icon: Clock,
      tint: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
    },
  ];

  const statCards = isAdmin ? adminCards : caseworkerCards;

  const attention = isAdmin
    ? [
        {
          show: (cards.pendingPayments || 0) > 0,
          href: '/dashboard/payments',
          count: cards.pendingPayments || 0,
          text: 'payment submissions awaiting approval',
        },
        {
          show: (cards.pendingWithdrawals || 0) > 0,
          href: '/dashboard/wallet',
          count: cards.pendingWithdrawals || 0,
          text: 'withdrawal requests waiting to be approved',
        },
        {
          show: (cards.pendingRequests || 0) > 0,
          href: '/dashboard/requests',
          count: cards.pendingRequests || 0,
          text: 'caseworker applications to review',
        },
      ].filter((a) => a.show)
    : [];

  const paymentStatusCard = (
    <ChartCard
      title="Payment Status"
      subtitle={`${formatNumber(paymentTotal)} submission${paymentTotal === 1 ? '' : 's'}`}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refresh}
      skeleton="donut"
      empty={paymentStatusData.length === 0}
      emptyText="No payments submitted yet."
    >
      <DonutBreakdown
        data={paymentStatusData}
        centerLabel="Payments"
        centerValue={formatNumber(paymentTotal)}
      />
    </ChartCard>
  );

  const caseStatusCard = (
    <ChartCard
      title={isAdmin ? 'Cases by Status' : 'My Cases by Status'}
      subtitle={isAdmin ? 'Every case on the system' : 'Cases assigned to you'}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refresh}
      skeleton="bars"
      empty={!hasCaseStatus}
      emptyText="No cases created yet."
    >
      <BarBreakdown
        data={caseStatusData}
        series={[{ key: 'count', name: 'Cases' }]}
        colorful
        countMode
      />
    </ChartCard>
  );

  const topCasesCard = (
    <ChartCard
      title={isAdmin ? 'Top Cases by Revenue' : 'Top Earning Cases'}
      subtitle={isAdmin ? 'Highest net revenue per case' : 'Your share of each case'}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refresh}
      skeleton="bars"
      empty={topCasesData.length === 0}
      emptyText="No approved payments yet."
    >
      <BarBreakdown
        data={topCasesData}
        layout="vertical"
        colorful
        series={[{ key: 'value', name: isAdmin ? 'Net Revenue' : 'My Earnings' }]}
      />
    </ChartCard>
  );

  return (
    <div className="space-y-6">
      {/* ---------------- headline metrics ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} loading={loading} />
        ))}
      </div>

      {refreshing ? (
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Spinner size={14} />
          Updating figures…
        </div>
      ) : null}

      {/* ---------------- admin call-to-action strip ---------------- */}
      {attention.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attention.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:border-amber-300 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
            >
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                {a.count}
              </span>
              {a.text}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      ) : null}

      {/* ---------------- trend + primary breakdown ---------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title={isAdmin ? 'Revenue Trend' : 'Earnings Trend'}
          subtitle={`Gross vs net over the last ${revenueTrend.length} months`}
          className="lg:col-span-2"
          loading={loading}
          refreshing={refreshing}
          error={error}
          onRefresh={refresh}
          skeleton="area"
          empty={!hasTrend}
          emptyText={
            isAdmin
              ? 'No approved payments yet — revenue appears here once payments are approved.'
              : 'No approved payments yet — submit a payment to start earning.'
          }
        >
          <AreaTrend data={revenueTrend} series={trendSeries} />
        </ChartCard>

        {isAdmin ? (
          <ChartCard
            title="Profit Split"
            subtitle="Net distributed per bucket"
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={refresh}
            skeleton="donut"
            empty={splitData.every((s) => !s.value)}
            emptyText="No profit distributed yet."
          >
            <DonutBreakdown
              data={splitData}
              centerLabel="Net"
              centerValue={formatCurrency(cards.totalNet)}
            />
          </ChartCard>
        ) : (
          paymentStatusCard
        )}
      </div>

      {/* ---------------- breakdowns ---------------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {isAdmin ? (
          <>
            {paymentStatusCard}
            {caseStatusCard}
            <ChartCard
              title="Top Caseworkers"
              subtitle="Net revenue generated"
              loading={loading}
              refreshing={refreshing}
              error={error}
              onRefresh={refresh}
              skeleton="bars"
              empty={topHandlersData.length === 0}
              emptyText="No distributions recorded yet."
            >
              <BarBreakdown
                data={topHandlersData}
                layout="vertical"
                series={[{ key: 'value', name: 'Net Revenue', color: CHART_COLORS.violet }]}
                colors={[CHART_COLORS.violet]}
                colorful
              />
            </ChartCard>
          </>
        ) : (
          <>
            {caseStatusCard}
            <div className="lg:col-span-2">{topCasesCard}</div>
          </>
        )}
      </div>

      {/* ---------------- admin-only full-width chart ---------------- */}
      {isAdmin ? topCasesCard : null}
    </div>
  );
}