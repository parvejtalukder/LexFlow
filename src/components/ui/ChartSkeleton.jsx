'use client';

// Fixed bar heights (no Math.random) so server and client markup always match.
const BAR_HEIGHTS = [40, 62, 35, 78, 55, 88, 46, 70, 30, 84, 60, 50];

/**
 * Animated placeholder that mirrors the shape of a chart while its data loads.
 *
 * @param {'area'|'bars'|'donut'} variant
 * @param {number} height  rendered height in px (match the real chart)
 * @param {number} bars    number of animated columns for bar/area variants
 */
export default function ChartSkeleton({ variant = 'area', height = 260, bars = 12 }) {
  if (variant === 'donut') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-6 sm:flex-nowrap" style={{ height }}>
        <div className="h-32 w-32 shrink-0 animate-pulse rounded-full border-[16px] border-gray-200 dark:border-gray-800" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height }}>
      <div className="flex flex-1 items-end gap-1.5 px-1">
        {BAR_HEIGHTS.slice(0, bars).map((h, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t bg-gray-200 dark:bg-gray-800"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-3 h-3 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}