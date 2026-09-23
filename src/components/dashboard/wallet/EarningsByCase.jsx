'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, TrendingUp } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ChartCard from '@/components/charts/ChartCard';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { CHART_COLORS } from '@/components/charts/chartTheme';
import useWalletData from '@/hooks/useWalletData';
import { PER_PAGE, SearchInput, SectionCard, StatCard, StatGroup, matchesQuery, money } from './WalletUI';

/**
 * Totals per case, shared by admins (firm-wide: case, client, handler, paid,
 * VAT, net) and caseworkers (their own slice: case, paid, net, their share).
 *
 * The columns differ on purpose — a caseworker never sees the firm's VAT split
 * or another handler's share — so the same component renders two shapes over
 * the same `byCase` array from `/api/wallet`.
 */
export default function EarningsByCase() {
  const { data, loading, isAdmin } = useWalletData({
    failureMessage: 'Failed to load case earnings.',
  });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const byCase = data?.byCase || [];

  const filtered = byCase.filter((c) =>
    matchesQuery(query, [c.caseNumber, c.caseTitle, c.clientName, c.handlerName])
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Admins rank by the net the firm billed; a caseworker ranks by what they
  // actually earned from each case.
  const shareOf = (c) => (isAdmin ? Number(c.net) || 0 : Number(c.handlerShare) || 0);
  const topCases = [...byCase]
    .sort((a, b) => shareOf(b) - shareOf(a))
    .slice(0, 6)
    .map((c) => ({ label: c.caseNumber || '—', value: shareOf(c) }));

  const filteredNet = filtered.reduce((sum, c) => sum + (Number(c.net) || 0), 0);
  const filteredShare = filtered.reduce((sum, c) => sum + (Number(c.handlerShare) || 0), 0);

  const emptyText = isAdmin
    ? 'No case earnings recorded yet.'
    : 'No approved payments yet — your share appears here once an admin approves a payment.';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} of {byCase.length} case{byCase.length === 1 ? '' : 's'}
        </span>
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder={isAdmin ? 'Search case, client, handler…' : 'Search case…'}
        />
      </div>

      {/* Totals for the rows currently listed, grouped like the rest of the money
          section. Both figures are computed from the filtered list below. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatGroup
          title="This filter"
          hint={isAdmin ? 'Across the cases listed below' : 'Across your listed cases'}
        >
          <StatCard
            label={isAdmin ? 'Net billed' : 'Net on your cases'}
            value={filteredNet}
            tone="text-gray-900 dark:text-gray-100"
            subtitle="Sum of the Net column below"
          />
          <StatCard
            label={isAdmin ? 'Caseworker share' : 'Your share'}
            value={filteredShare}
            tone="text-emerald-600 dark:text-emerald-400"
            subtitle="Recorded handler share of each payment"
          />
        </StatGroup>
      </div>

      <ChartCard
        title={isAdmin ? 'Top Cases by Net' : 'Top Earning Cases'}
        subtitle={isAdmin ? 'Highest net amount per case' : 'Your share per case, highest first'}
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
          series={[{ key: 'value', name: isAdmin ? 'Net Amount' : 'Your Share' }]}
        />
      </ChartCard>

      <SectionCard
        title="Earnings by Case"
        subtitle={
          loading
            ? undefined
            : isAdmin
            ? `${money(filteredNet)} net in view`
            : `${money(filteredShare)} earned in view`
        }
      >
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Earnings by case table, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table className={`w-full text-sm ${isAdmin ? 'min-w-[760px]' : 'min-w-[560px]'}`}>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                <th className="py-2 pr-3 font-semibold">Case</th>
                {isAdmin && <th className="py-2 pr-3 font-semibold">Client</th>}
                {isAdmin && <th className="py-2 pr-3 font-semibold">Handler</th>}
                <th className="py-2 pr-3 font-semibold text-right">Paid</th>
                {isAdmin && <th className="py-2 pr-3 font-semibold text-right">VAT</th>}
                <th className="py-2 pr-3 font-semibold text-right">Net</th>
                {!isAdmin && <th className="py-2 font-semibold text-right">Your Share</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={isAdmin ? 6 : 4} rows={PER_PAGE} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 4} className="px-4 py-12 text-center text-gray-500">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    {emptyText}
                  </td>
                </tr>
              ) : (
                paginated.map((c) => (
                  <tr key={c.caseId} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
                    <td className="py-3 pr-3">
                      {c.caseId ? (
                        <Link
                          href={`/dashboard/cases/${c.caseId}`}
                          className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          {c.caseNumber || '—'}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100">{c.caseNumber || '—'}</span>
                      )}
                      <span className="block text-[11px] text-gray-400">{c.caseTitle}</span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 pr-3 text-gray-600 dark:text-gray-300">{c.clientName || '—'}</td>
                    )}
                    {isAdmin && (
                      <td className="py-3 pr-3 text-gray-600 dark:text-gray-300">{c.handlerName || '—'}</td>
                    )}
                    <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(c.totalPaid)}</td>
                    {isAdmin && (
                      <td className="py-3 pr-3 text-right text-gray-600 dark:text-gray-300">{money(c.vat)}</td>
                    )}
                    <td className="py-3 pr-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                      {money(c.net)}
                    </td>
                    {!isAdmin && (
                      <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {money(c.handlerShare)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </SectionCard>

      {!isAdmin && (
        <p className="flex items-center gap-2 text-[11px] text-gray-400">
          <TrendingUp className="h-3.5 w-3.5" />
          A case settled in part-payments is allocated payment by payment, so each approved payment adds its own
          share here.
        </p>
      )}
    </div>
  );
}