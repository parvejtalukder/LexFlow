'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_COLORS, ChartTooltip } from './chartTheme';
import { formatCurrency, formatPercent } from '@/lib/format';

/**
 * Donut chart with a custom Tailwind legend (Recharts' own <Legend /> cannot be
 * dark-mode styled reliably). Shows a muted ring when every value is zero.
 *
 * @param {Array} data [{ name, value, color? }]
 */
export default function DonutBreakdown({
  data = [],
  colors = [CHART_COLORS.indigo, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.rose, CHART_COLORS.violet],
  height = 260,
  centerLabel,
  centerValue,
  valueFormatter = formatCurrency,
}) {
  const items = (data || []).map((d, i) => ({
    ...d,
    value: Number(d.value) || 0,
    color: d.color || colors[i % colors.length],
  }));

  const total = items.reduce((sum, d) => sum + d.value, 0);

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="flex h-40 w-40 items-center justify-center rounded-full border-[18px] border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">Nothing recorded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 sm:flex-nowrap" style={{ height }}>
      <div className="relative shrink-0" style={{ width: 168, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={items.length > 1 ? 2 : 0}
              stroke="none"
              animationDuration={600}
            >
              {items.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            {centerLabel}
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {centerValue != null ? centerValue : valueFormatter(total)}
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2 sm:w-auto sm:flex-1">
        {items.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="truncate text-gray-600 dark:text-gray-300">{d.name}</span>
            <span className="ml-auto whitespace-nowrap pl-3 font-semibold text-gray-900 dark:text-gray-100">
              {valueFormatter(d.value)}
            </span>
            <span className="w-10 shrink-0 text-right text-gray-400">
              {formatPercent((d.value / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}