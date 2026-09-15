'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * Dashboard headline metric card with a built-in loading skeleton so the grid
 * never re-flows between the loading and loaded states.
 *
 * @param {number|string} value  pass `null`/`undefined` while loading
 * @param {string} hint          small right-aligned caption (e.g. "this month")
 */
export default function StatCard({ label, value, hint, icon: Icon, tint, loading = false, className }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className={cn('rounded-lg p-2', tint || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300')}>
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
        {loading ? (
          <Skeleton className="h-4 w-16" />
        ) : hint ? (
          <span className="truncate text-[11px] font-medium text-gray-400">{hint}</span>
        ) : null}
      </div>

      <h3 className="mb-1 font-medium text-gray-600 dark:text-gray-400">{label}</h3>

      {loading ? (
        <Skeleton className="h-8 w-28" />
      ) : (
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      )}
    </div>
  );
}