'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, CHART_COLORS, ChartTooltip, GRID_STROKE } from './chartTheme';
import { formatCompactCurrency } from '@/lib/format';

/**
 * Bar chart for categorical comparisons (cases by status, top cases, top
 * caseworkers).
 *
 * @param {'vertical'|'horizontal'} layout 'vertical' = bars run horizontally
 *                                         (best for long category names)
 * @param {boolean} colorful           colour each bar from `colors`
 * @param {boolean} countMode          render whole numbers instead of currency
 */
export default function BarBreakdown({
  data = [],
  xKey = 'label',
  series = [],
  layout = 'horizontal',
  height = 260,
  colorful = false,
  colors = [CHART_COLORS.indigo, CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.rose],
  countMode = false,
}) {
  const isHorizontalBars = layout === 'vertical';
  const tickFormatter = countMode ? (v) => v : formatCompactCurrency;

  return (
    <div className="w-full text-gray-500 dark:text-gray-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={isHorizontalBars ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={isHorizontalBars}
            horizontal={!isHorizontalBars}
            stroke={GRID_STROKE}
          />

          {isHorizontalBars ? (
            <>
              <XAxis
                type="number"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickFormatter}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={104}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} dy={6} />
              <YAxis
                type="number"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={tickFormatter}
                allowDecimals={false}
              />
            </>
          )}

          <Tooltip
            content={<ChartTooltip valueFormatter={countMode ? (v) => v : undefined} />}
            cursor={{ fill: GRID_STROKE }}
          />

          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color || CHART_COLORS.indigo}
              radius={isHorizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={isHorizontalBars ? 22 : 36}
              animationDuration={600}
            >
              {colorful
                ? data.map((d, i) => (
                    <Cell key={d[xKey] ?? i} fill={d.color || colors[i % colors.length]} />
                  ))
                : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}