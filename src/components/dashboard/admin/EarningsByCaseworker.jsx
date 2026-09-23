'use client';

import { useState } from 'react';
import { Building2, Landmark, TrendingUp, Wallet } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ChartCard from '@/components/charts/ChartCard';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { CHART_COLORS, SPLIT_COLORS } from '@/components/charts/chartTheme';
import useWalletData from '@/hooks/useWalletData';
import {
  PER_PAGE,
  SearchInput,
  SectionCard,
  StatCard,
  StatGroup,
  matchesQuery,
  money,
} from '@/components/dashboard/wallet/WalletUI';

/**
 * Firm-wide earnings ranked by the caseworker who earned them: how much each
 * handler brought in, what the firm's two branches took, and how much of the
 * handler share has already left the wallet.
 *
 * The figures come from `/api/wallet`'s `byHandler`, `summary.totalHandler`,
 * `summary.totalHq` and `summary.totalEl`. Admins only.
 */
export default function EarningsByCaseworker() {
  const { data, loading } = useWalletData({
    failureMessage: 'Failed to load caseworker earnings.',
  });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const summary = data?.summary || {};
  const byHandler = data?.byHandler || [];

  const filtered = byHandler.filter((h) => matchesQuery(query, [h.handlerName]));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Net profit buckets: exactly what the profit-split produced, so the donut
  // ties back to Total Net without double counting.
  const splitBuckets = [
    { name: 'Caseworkers', value: summary.totalHandler || 0, color: SPLIT_COLORS[0] },
    { name: 'Head Office', value: summary.totalHq || 0, color: SPLIT_COLORS[1] },
    { name: 'East London', value: summary.totalEl || 0, color: SPLIT_COLORS[2] },
  ];
  const splitTotal = splitBuckets.reduce((s, b) => s + b.value, 0);

  const topEarners = [...byHandler]
    .sort((a, b) => (b.handlerShare || 0) - (a.handlerShare || 0))
    .slice(0, 6)
    .map((h) => ({ label: h.handlerName || '—', value: h.handlerShare || 0 }));

  return (
    <div className="space-y-4">
      {/* Grouped the same way as the rest of the money section: what the net was,
          then how it was split. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StatGroup title="Net distributed" hint="Everything approved payments produced">
          <StatCard
            label="Total net"
            value={summary.totalNet}
            tone="text-gray-900 dark:text-gray-100"
            icon={Wallet}
          />
        </StatGroup>

        <StatGroup title="Split of net" hint="Recorded per distribution when it was approved">
          <StatCard
            label="Caseworker share"
            value={summary.totalHandler}
            tone="text-emerald-600 dark:text-emerald-400"
            icon={TrendingUp}
          />
          <StatCard
            label="Head Office share"
            value={summary.totalHq}
            tone="text-indigo-600 dark:text-indigo-400"
            icon={Building2}
          />
          <StatCard
            label="East London share"
            value={summary.totalEl}
            tone="text-amber-600 dark:text-amber-400"
            icon={Landmark}
          />
        </StatGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Profit Split"
          subtitle="Net distributed across the firm"
          skeleton="donut"
          loading={loading}
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
          title="Top Caseworkers"
          subtitle="Handler share earned, highest first"
          skeleton="bars"
          loading={loading}
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
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} of {byHandler.length} caseworker{byHandler.length === 1 ? '' : 's'}
        </span>
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Search caseworker…"
        />
      </div>

      <SectionCard title="Earnings by Caseworker" subtitle={`${filtered.length} of ${byHandler.length}`}>
        {!loading && filtered.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {byHandler.length === 0 ? 'No earnings recorded yet.' : 'No caseworker matches this search.'}
          </p>
        ) : (
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Earnings by caseworker table, scroll horizontally for more columns"
            tabIndex={0}
          >
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
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
                {loading ? (
                  <TableSkeleton cols={8} rows={PER_PAGE} />
                ) : (
                  paginated.map((h) => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </SectionCard>
    </div>
  );
}