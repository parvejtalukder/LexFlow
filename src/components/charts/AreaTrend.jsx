'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_TICK, ChartTooltip, GRID_STROKE } from './chartTheme';
import { formatCompactCurrency } from '@/lib/format';

/**
 * Gradient area chart for time series (revenue / earnings per month).
 *
 * @param {Array}  data   rows, e.g. [{ label: 'Mar', gross: 1200, net: 1000 }]
 * @param {Array}  series [{ key: 'net', name: 'Net Revenue', color: '#10b981' }]
 * @param {string} xKey   category key (default 'label')
 */
export default function AreaTrend({ data = [], series = [], xKey = 'label', height = 260 }) {
  // useId() output contains ':' characters that break SVG url(#…) references.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <div className="w-full text-gray-500 dark:text-gray-400" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.key}
                id={`area-${uid}-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} tickLine={false} axisLine={false} dy={6} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={formatCompactCurrency}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
          />

          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#area-${uid}-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={600}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}