/**
 * Transaction History view-model.
 *
 * A "transaction" here is a derived, read-only projection over records that
 * already exist. Nothing in this module is persisted and it is deliberately NOT
 * a second source of truth:
 *
 *   profitDistributions -> EARNED      (money credited to a handler wallet)
 *   withdrawals         -> WITHDRAWAL  (account HANDLER)
 *                       -> PAYOUT      (account HQ / EL)
 *   payments            -> PAYMENT     (gross invoiced; admins only)
 *
 * HISTORICAL SPLIT RULE (non-negotiable)
 * Every amount and percentage below is read from the stored record. The
 * distribution row freezes handlerParcentage / hqParcentage / elParcentage and
 * handlerAmount / hqAmount / elAmount at approval time, so a later edit to a
 * caseworker's split must never change an existing transaction. This module
 * therefore must never call resolveSplit() or read the handler's *current*
 * percentages - those describe future approvals only.
 */

import { serializeDistribution, serializePayment } from '@/lib/finance';
import { ACCOUNT_LABELS, accountOf, serializeWithdrawal } from '@/lib/wallet';

export const TX_TYPES = {
  EARNED: 'EARNED',
  WITHDRAWAL: 'WITHDRAWAL',
  PAYOUT: 'PAYOUT',
  PAYMENT: 'PAYMENT',
};

/** Types an admin may see. Caseworkers are limited to their own earnings and withdrawals. */
export const ADMIN_TYPES = [
  TX_TYPES.EARNED,
  TX_TYPES.WITHDRAWAL,
  TX_TYPES.PAYOUT,
  TX_TYPES.PAYMENT,
];

/** Types that move wallet money, i.e. the ones the summary totals are built from. */
const WALLET_TYPES = [TX_TYPES.EARNED, TX_TYPES.WITHDRAWAL, TX_TYPES.PAYOUT];

const STATUS_PAID = 'PAID';
const STATUS_RESERVED = ['PENDING', 'APPROVED'];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_RANGE_MONTHS = 12;
/** Statements return every row in the range, so they are capped explicitly. */
export const MAX_STATEMENT_ROWS = 5000;

export const STATUS_OPTIONS = ['EARNED', 'PENDING', 'APPROVED', 'PAID', 'REJECTED', 'VOIDED'];

/** A date input value with no time part, i.e. a calendar day rather than an instant. */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn one end of the requested window into an instant.
 *
 * The range inputs send `YYYY-MM-DD`, and `new Date('2026-09-23')` is midnight at
 * the *start* of that day. Used as an upper bound that silently excluded every
 * record made after 00:00 on the end date — the whole current day's earnings and
 * payouts — while client payments survived only because a date picker stores them
 * at exactly midnight. A bare date is therefore widened to the entire calendar
 * day, and a full timestamp is honoured exactly.
 *
 * Days are UTC, matching how the rest of the app buckets time (monthKeyOf in
 * src/app/api/dashboard/stats/route.js) and how payment dates are stored.
 *
 * @param {string|Date|null|undefined} value
 * @param {'start'|'end'} edge which end of the day a bare date means
 * @returns {Date|null} null when the value is missing or unparseable
 */
export function parseDayBound(value, edge = 'start') {
  if (value == null || value === '') return null;

  const text = String(value).trim();

  if (DAY_ONLY.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    const dayStart = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(dayStart.getTime())) return null;
    if (edge !== 'end') return dayStart;
    // 23:59:59.999 keeps the end date inclusive to the millisecond.
    return new Date(dayStart.getTime() + 86_400_000 - 1);
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolve the requested window. A range is always applied: the financial
 * collections have no indexes yet, so an unbounded scan is both slow and
 * memory-hungry.
 *
 * `from` is inclusive from the start of its day and `to` is inclusive to the end
 * of its day, so selecting a single date returns that whole day. With no `from`
 * the default window is the last DEFAULT_RANGE_MONTHS months. An unparseable end
 * falls back to the current instant and an unparseable start to the default
 * window: a bad query string must never blank the page.
 */
export function resolveRange(from, to, now = new Date()) {
  const toDate = parseDayBound(to, 'end') || now;
  const fromDate =
    parseDayBound(from, 'start') ||
    new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() - DEFAULT_RANGE_MONTHS, 1));

  return { fromDate, toDate };
}

/** Escape user input before it reaches a MongoDB $regex. */
export function searchRegex(query) {
  const q = String(query ?? '').trim();
  if (!q) return null;
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function clampPage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function clampPageSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.floor(n));
}

/** Parse the comma-separated `type` / `status` filters into a Set (empty = no filter). */
export function parseList(value) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean)
  );
}


/**
 * An earning row. `includeCompanySplits` mirrors serializeDistribution(): the HQ
 * and EL figures stay out of every caseworker-facing payload.
 */
function augmentDistribution(d, includeCompanySplits) {
  return {
    ...serializeDistribution(d, includeCompanySplits),
    type: TX_TYPES.EARNED,
    direction: 'in',
    // EARNED is a state, not a workflow status: a distribution exists only once
    // an admin approved the matching payment.
    status: 'EARNED',
    date: d.createdAt,
    amount: d.handlerAmount,
    // Display text for tables/statements. Kept separate from `description` so a
    // payment's own free-text description is not overwritten.
    label: d.caseNumber ? `Case ${d.caseNumber} — earnings` : 'Case earnings',
  };
}

function augmentWithdrawal(w) {
  const account = accountOf(w);
  const isHandler = account === 'HANDLER';
  const serialized = serializeWithdrawal(w);

  return {
    ...serialized,
    type: isHandler ? TX_TYPES.WITHDRAWAL : TX_TYPES.PAYOUT,
    // Only an approved/paid payout has actually left the wallet; a pending or
    // rejected one must not be shown as money out.
    direction: serialized.status === 'APPROVED' || serialized.status === 'PAID' ? 'out' : 'neutral',
    date: w.requestedAt || w.createdAt,
    label: isHandler ? 'Withdrawal' : `${ACCOUNT_LABELS[account] || account} payout`,
  };
}

function augmentPayment(p) {
  return {
    ...serializePayment(p),
    type: TX_TYPES.PAYMENT,
    // Informational row: the gross the client paid, with the VAT it contained.
    // Excluded from the wallet totals below so gross is never added on top of
    // the net that was actually distributed.
    direction: 'recorded',
    date: p.receivedAt || p.createdAt,
    label: p.caseNumber ? `Case ${p.caseNumber} — client payment` : 'Client payment',
  };
}

export function buildRows(
  { distributions = [], withdrawals = [], payments = [] },
  { includeCompanySplits = false } = {}
) {
  return [
    ...distributions.map((d) => augmentDistribution(d, includeCompanySplits)),
    ...withdrawals.map(augmentWithdrawal),
    ...payments.map(augmentPayment),
  ];
}

/** Newest first, with the id as a deterministic tiebreak for same-timestamp rows. */
export function sortTransactions(rows) {
  return [...rows].sort((a, b) => {
    const diff = new Date(b.date || 0) - new Date(a.date || 0);
    if (diff !== 0) return diff;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function paginate(rows, page, pageSize) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  return {
    total,
    totalPages,
    page: safePage,
    rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
  };
}

/**
 * Totals for the strip above the table.
 *
 * `earned` / `paidOut` / `reserved` are wallet money. `paymentGross` and
 * `paymentVat` are reported separately because the gross already contains both
 * the VAT and the net that produced the earnings - adding them to the wallet
 * figures would double count.
 */
export function summarize(rows) {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const sum = (list, key) => round2(list.reduce((s, r) => s + (Number(r[key]) || 0), 0));

  const walletRows = rows.filter((r) => WALLET_TYPES.includes(r.type));
  const paymentRows = rows.filter((r) => r.type === TX_TYPES.PAYMENT);

  return {
    earned: sum(walletRows.filter((r) => r.type === TX_TYPES.EARNED), 'amount'),
    paidOut: sum(walletRows.filter((r) => r.status === STATUS_PAID), 'amount'),
    reserved: sum(walletRows.filter((r) => STATUS_RESERVED.includes(r.status)), 'amount'),
    paymentGross: sum(paymentRows, 'amount'),
    paymentVat: sum(paymentRows, 'vat'),
    count: rows.length,
  };
}
