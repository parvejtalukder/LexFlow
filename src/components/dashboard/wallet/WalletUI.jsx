'use client';

/**
 * Shared building blocks for the wallet / earnings section.
 *
 * The wallet used to be one component with every panel stacked inside it; it is
 * now split across four routes (`/dashboard/wallet`,
 * `/dashboard/earnings-by-case`, `/dashboard/earnings-by-caseworker` and
 * `/dashboard/withdrawal-requests`). Everything those pages render the same way
 * lives here so the money formatting, badges and card chrome cannot drift apart.
 */

import { Search, Wallet as WalletIcon } from 'lucide-react';
import { CHART_COLORS, humanizeStatus } from '@/components/charts/chartTheme';

/** Every collection table in this section shows ten rows per page. */
export const PER_PAGE = 10;

export const money = (v) =>
  v == null ? '—' : `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

/**
 * Is this instant a date-only value?
 *
 * Date pickers submit `YYYY-MM-DD`, which the API stores as midnight UTC, so a
 * client payment carries a calendar day rather than a time. Formatting those with
 * a clock produced noise like "23/09/2026, 06:00:00" (and the previous day for
 * anyone west of UTC), so they are rendered as a plain day instead.
 */
export const isDayOnly = (value) => {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
};

/**
 * Money dates are shown in UTC, which is also how the transaction window and the
 * monthly buckets are computed (see resolveRange / monthKeyOf), so what a filter
 * says and what a row shows can never disagree.
 */
export const fmtDay = (value) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** A day for a date-only value, a full timestamp for a real instant. */
export const fmtWhen = (value) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  if (isDayOnly(d)) return fmtDay(d);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
};

/** "01 Sep 2025 – 23 Sep 2026", the window a request actually covered. */
export const fmtRange = (from, to) =>
  from && to ? `${fmtDay(from)} – ${fmtDay(to)}` : '—';

export const statusTone = {
  PAID: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  REJECTED: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
};

/** Which ledger a withdrawal was paid out of. */
export const accountBadge = {
  HQ: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800',
  EL: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  HANDLER: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
};

export const accountLabel = { HQ: 'Head Office', EL: 'East London', HANDLER: 'Caseworker' };

/** Withdrawal lifecycle colours for the payout pipeline chart. */
export const WITHDRAWAL_STATUS_COLORS = {
  PENDING: CHART_COLORS.amber,
  APPROVED: CHART_COLORS.blue,
  PAID: CHART_COLORS.emerald,
  REJECTED: CHART_COLORS.rose,
};

/** Counts of each lifecycle status, in pipeline order. */
export function pipelineBars(rows) {
  const counts = (rows || []).reduce((acc, w) => {
    acc[w.status] = (acc[w.status] || 0) + 1;
    return acc;
  }, {});

  return ['PENDING', 'APPROVED', 'PAID', 'REJECTED'].map((status) => ({
    label: humanizeStatus(status),
    count: counts[status] || 0,
    color: WITHDRAWAL_STATUS_COLORS[status],
  }));
}

/** Case-insensitive "does any of these fields contain the query" filter. */
export function matchesQuery(query, values) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => String(v ?? '').toLowerCase().includes(q));
}

export function StatusBadge({ status }) {
  const tone = statusTone[status] || statusTone.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}

export function StatCard({ label, value, tone, icon: Icon, plain = false, subtitle }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-gray-400" /> : <WalletIcon className="h-4 w-4 text-gray-400" />}
      </div>
      <p className={`mt-2 text-2xl font-bold ${tone || 'text-gray-900 dark:text-gray-100'}`}>
        {plain ? (value ?? '—') : money(value)}
      </p>
      {subtitle ? <p className="mt-1 text-[11px] text-gray-400">{subtitle}</p> : null}
    </div>
  );
}

/**
 * A labelled group of figures, shared by every page in the money section.
 *
 * Grouping is what makes these pages readable: a flat row of cards gave no clue
 * which figures were money coming in, which had already left a wallet, and which
 * was merely a count.
 */
export function StatGroup({ title, hint, children }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h3>
        {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">{children}</div>
    </div>
  );
}

export function SectionCard({ title, subtitle, children, actions }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <div className="flex items-center gap-3">
          {subtitle ? <span className="text-xs text-gray-400">{subtitle}</span> : null}
          {actions}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** The search box used above every collection table in this section. */
export function SearchInput({ value, onChange, placeholder, className = 'sm:w-72' }) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

/** A single ledger row's tinted "chip" (used by the withdrawal filters). */
export function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
        active
          ? 'bg-[#080B1A] text-white border-[#080B1A]'
          : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}