/**
 * Server-side loader for Transaction History and statements.
 *
 * Filters are pushed into MongoDB ($gte/$lte on the record's own date field, and
 * the type/status/account constraints), so the browser receives one page rather
 * than the whole financial database. A hard fetch cap bounds a single request
 * even when no range is supplied.
 *
 * Like the view-model it feeds, this module only reads stored values: the split
 * percentages and amounts it returns are the ones frozen on the distribution row
 * when the payment was approved.
 */

import { COLLECTIONS, getCollection } from '@/lib/collections';
import {
  ADMIN_TYPES,
  TX_TYPES,
  buildRows,
  parseList,
  resolveRange,
  searchRegex,
  sortTransactions,
  summarize,
} from '@/lib/transactions';

const HANDLER = 'HANDLER';
const COMPANY_ACCOUNTS = ['HQ', 'EL'];

/** Statuses each source can actually hold. */
const WITHDRAWAL_STATUSES = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'];
const PAYMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'VOIDED'];

/** Safety bound so a single request can never stream an unbounded result set. */
export const FETCH_CAP = 5000;

/** The types this caller is allowed to see, intersected with what they asked for. */
function allowedTypes({ admin, scope, requested }) {
  const allowed = admin && scope === 'firm' ? ADMIN_TYPES : [TX_TYPES.EARNED, TX_TYPES.WITHDRAWAL];
  if (requested.size === 0) return new Set(allowed);
  return new Set(allowed.filter((t) => requested.has(t)));
}

/** Which of `values` the caller asked for; `undefined` means "no status filter". */
function statusSubset(statuses, values) {
  if (statuses.size === 0) return undefined;
  return values.filter((v) => statuses.has(v));
}

/**
 * Restrict the withdrawal query to the right ledger.
 *   personal -> the caller's own rows (company rows carry caseworkerUid: null,
 *               so they can never match)
 *   firm     -> HANDLER rows for WITHDRAWAL, HQ/EL rows for PAYOUT, or the
 *               explicit `account` filter when one was supplied.
 */
function accountFilter({ scope, uid, types, account }) {
  if (scope !== 'firm') return { caseworkerUid: uid };

  if (account === 'HQ' || account === 'EL') return { account };
  // $nin also matches records where `account` is absent, which is exactly how
  // legacy handler rows are identified by accountOf().
  if (account === HANDLER) return { account: { $nin: COMPANY_ACCOUNTS } };

  const wantsWithdrawal = types.has(TX_TYPES.WITHDRAWAL);
  const wantsPayout = types.has(TX_TYPES.PAYOUT);
  if (wantsWithdrawal && !wantsPayout) return { account: { $nin: COMPANY_ACCOUNTS } };
  if (wantsPayout && !wantsWithdrawal) return { account: { $in: COMPANY_ACCOUNTS } };
  return {};
}

function scopeFilter(scope, uid) {
  return scope === 'firm' ? {} : { handlerId: uid };
}

export function parseScope(value, admin) {
  const scope = String(value ?? '').trim().toLowerCase() === 'firm' && admin ? 'firm' : 'personal';
  return scope;
}


/**
 * Load every transaction in the requested window, newest first.
 *
 * Returns `capped: true` when the window held more rows than `maxRows`, so the
 * caller can tell the user to narrow the range instead of silently truncating.
 */
export async function collectTransactions({ uid, admin, params = {}, maxRows = FETCH_CAP }) {
  const scope = parseScope(params.scope, admin);
  const { fromDate, toDate } = resolveRange(params.from, params.to);
  const types = allowedTypes({ admin, scope, requested: parseList(params.type) });
  const statuses = parseList(params.status);
  const regex = searchRegex(params.q);

  const dateRange = { $gte: fromDate, $lte: toDate };
  // Same role rule the rest of the app uses: only admins ever receive HQ/EL.
  const includeCompanySplits = admin;
  let capped = false;

  const jobs = [];

  // ---------------------------------------------------------------- earnings
  if (types.has(TX_TYPES.EARNED) && (statuses.size === 0 || statuses.has('EARNED'))) {
    jobs.push(
      (async () => {
        const collection = await getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS);
        const filter = { createdAt: dateRange, ...scopeFilter(scope, uid) };
        if (regex) filter.$or = [{ caseNumber: regex }, { handlerName: regex }];

        const docs = await collection
          .find(filter)
          .sort({ createdAt: -1 })
          .limit(maxRows + 1)
          .toArray();

        if (docs.length > maxRows) {
          capped = true;
          docs.length = maxRows;
        }
        return { distributions: docs };
      })()
    );
  }

  // ------------------------------------------- withdrawals and branch payouts
  const withdrawalStatuses = statusSubset(statuses, WITHDRAWAL_STATUSES);
  if (
    (types.has(TX_TYPES.WITHDRAWAL) || types.has(TX_TYPES.PAYOUT)) &&
    (statuses.size === 0 || (withdrawalStatuses && withdrawalStatuses.length > 0))
  ) {
    jobs.push(
      (async () => {
        const collection = await getCollection(COLLECTIONS.WITHDRAWALS);
        const filter = {
          requestedAt: dateRange,
          ...accountFilter({ scope, uid, types, account: params.account }),
        };
        if (withdrawalStatuses) filter.status = { $in: withdrawalStatuses };
        if (regex) {
          filter.$or = [
            { caseworkerName: regex },
            { paymentReference: regex },
            { paymentMethod: regex },
            { note: regex },
          ];
        }

        const docs = await collection
          .find(filter)
          .sort({ requestedAt: -1 })
          .limit(maxRows + 1)
          .toArray();

        if (docs.length > maxRows) {
          capped = true;
          docs.length = maxRows;
        }
        return { withdrawals: docs };
      })()
    );
  }

  // ----------------------------------------------------------------- payments
  // Gross client payments are firm-level information: they are never part of a
  // personal history, and a caseworker never sees them at all.
  if (scope === 'firm' && types.has(TX_TYPES.PAYMENT)) {
    const paymentStatuses = statusSubset(statuses, PAYMENT_STATUSES);
    if (statuses.size === 0 || (paymentStatuses && paymentStatuses.length > 0)) {
      jobs.push(
        (async () => {
          const collection = await getCollection(COLLECTIONS.PAYMENTS);
          const filter = { receivedAt: dateRange };
          if (paymentStatuses) filter.status = { $in: paymentStatuses };
          if (regex) {
            filter.$or = [
              { caseNumber: regex },
              { caseTitle: regex },
              { clientName: regex },
              { handlerName: regex },
              { reference: regex },
            ];
          }

          const docs = await collection
            .find(filter)
            .sort({ receivedAt: -1 })
            .limit(maxRows + 1)
            .toArray();

          if (docs.length > maxRows) {
            capped = true;
            docs.length = maxRows;
          }
          return { payments: docs };
        })()
      );
    }
  }

  const parts = await Promise.all(jobs);
  const sources = { distributions: [], withdrawals: [], payments: [] };
  for (const part of parts) {
    for (const key of Object.keys(sources)) {
      if (part[key]) sources[key].push(...part[key]);
    }
  }

  let rows = sortTransactions(buildRows(sources, { includeCompanySplits }));

  // Final guard: an EARNED row must not survive a status filter that excluded
  // EARNED, and the totals below must describe exactly the rows shown.
  if (statuses.size > 0) rows = rows.filter((row) => statuses.has(row.status));
  if (rows.length > maxRows) {
    capped = true;
    rows = rows.slice(0, maxRows);
  }

  return {
    scope,
    types: [...types],
    statuses: [...statuses],
    range: { from: fromDate.toISOString(), to: toDate.toISOString() },
    rows,
    totals: summarize(rows),
    capped,
  };
}
