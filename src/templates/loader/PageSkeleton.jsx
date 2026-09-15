'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import ChartSkeleton from '@/components/ui/ChartSkeleton';

/**
 * Layout-preserving skeleton for data-heavy dashboard pages (wallet, earnings…).
 *
 * Renders the same shell the real page will use — header, stat grid, chart
 * cards and a table block — so nothing shifts or flashes empty while the
 * request is in flight.
 *
 * @param {number} stats  number of stat cards to draw
 * @param {number} charts number of chart cards to draw
 * @param {'area'|'bars'|'donut'} chartVariant shape of the chart placeholders
 * @param {boolean} table render a table placeholder under the charts
 */
export default function PageSkeleton({ stats = 4, charts = 2, chartVariant = 'bars', table = true }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>

      {/* ---- page header ---- */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      {/* ---- headline metrics ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="size-4" />
            </div>
            <Skeleton className="mt-3 h-6 w-24" />
          </div>
        ))}
      </div>

      {/* ---- charts ---- */}
      <div className={`grid grid-cols-1 gap-4 ${charts > 1 ? 'lg:grid-cols-2' : ''}`}>
        {Array.from({ length: charts }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-48" />
            <div className="mt-4">
              <ChartSkeleton variant={i === 0 ? chartVariant : 'bars'} height={260} />
            </div>
          </div>
        ))}
      </div>

      {/* ---- table block ---- */}
      {table ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-800">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-3.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}