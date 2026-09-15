'use client';

import ChartSkeleton from '@/components/ui/ChartSkeleton';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Frame shared by every dashboard chart: title, optional action, and the
 * loading / error / empty states so each chart component only renders SVG.
 */
export default function ChartCard({
  title,
  subtitle,
  action,
  children,
  loading = false,
  refreshing = false,
  error = null,
  onRefresh,
  empty = false,
  emptyText = 'No data available yet.',
  skeleton = 'area',
  height = 260,
  className,
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={`Refresh ${title}`}
              className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              {refreshing ? <Spinner size={14} /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex-1">
        {loading ? (
          <ChartSkeleton variant={skeleton} height={height} />
        ) : error ? (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-rose-200 bg-rose-50/50 px-4 text-center dark:border-rose-900/40 dark:bg-rose-950/20"
            style={{ height }}
          >
            <AlertCircle className="h-5 w-5 text-rose-500" />
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="text-xs font-semibold text-rose-600 underline dark:text-rose-400"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : empty ? (
          <div
            className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 px-4 text-center dark:border-gray-800"
            style={{ height }}
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}