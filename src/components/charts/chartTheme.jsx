'use client';

import { formatCurrency } from '@/lib/format';

/**
 * Shared Recharts theming.
 *
 * Colours are explicit hex values (Recharts renders raw SVG and cannot use
 * Tailwind colour classes). Text/grid elements instead use `currentColor` or a
 * translucent slate so a single chart works in both light and dark mode.
 */
export const CHART_COLORS = {
  indigo: '#6366f1',
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  slate: '#94a3b8',
};

export const PAYMENT_STATUS_COLORS = {
  PENDING: CHART_COLORS.amber,
  APPROVED: CHART_COLORS.emerald,
  REJECTED: CHART_COLORS.rose,
  VOIDED: CHART_COLORS.slate,
};

export const CASE_STATUS_COLORS = {
  PENDING: CHART_COLORS.amber,
  OPEN: CHART_COLORS.blue,
  IN_PROGRESS: CHART_COLORS.violet,
  CLOSED: CHART_COLORS.emerald,
  REJECTED: CHART_COLORS.rose,
};

/** Handler / Head Office / East London profit buckets. */
export const SPLIT_COLORS = [CHART_COLORS.emerald, CHART_COLORS.blue, CHART_COLORS.amber];

/** Works on both #fff and gray-950 backgrounds. */
export const GRID_STROKE = 'rgba(148, 163, 184, 0.25)';

/** Inherits the wrapper's text colour, which is themed with Tailwind. */
export const AXIS_TICK = { fill: 'currentColor', fontSize: 11 };

/** Pretty label for an ENUM-ish status value. */
export function humanizeStatus(status) {
  return String(status || '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = labelFormatter ? labelFormatter(label) : label;

  return (
    <div className="rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
      {heading ? (
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {heading}
        </p>
      ) : null}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey ?? entry.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color || entry.payload?.fill || CHART_COLORS.slate }}
            />
            <span className="text-gray-500 dark:text-gray-400">{entry.name}</span>
            <span className="ml-auto pl-3 font-semibold text-gray-900 dark:text-gray-100">
              {valueFormatter ? valueFormatter(entry.value, entry) : formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}