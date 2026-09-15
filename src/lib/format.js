/**
 * Shared number / currency formatting helpers for the dashboard.
 * Locale is left to the runtime default to match the existing components,
 * which all render money as `£` + grouped digits.
 */

export function formatCurrency(value, { decimals = 2 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Axis-friendly currency: £1.2M / £12.4k / £840 */
export function formatCompactCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `£${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `£${Math.round(n)}`;
}

export function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

export function formatPercent(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}
