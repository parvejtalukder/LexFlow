import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { CASE_STATUSES, isAdmin } from '@/lib/cases';
import { PAYMENT_STATUSES, resolveSplit } from '@/lib/finance';
import {
  COMPANY_ACCOUNTS,
  accountOf,
  computeCompanyBalance,
  computeWalletBalance,
} from '@/lib/wallet';

/**
 * Aggregated numbers that power the dashboard charts.
 *
 * Role aware:
 *  - admin      -> firm-wide figures, including the Handler/HQ/EL profit split.
 *  - caseworker -> only their own cases, payments and distributions. The HQ and
 *                  East London shares are never included in the payload.
 */

const MONTHS_BACK = 6;

const CASE_STATUS_ORDER = [
  CASE_STATUSES.PENDING,
  CASE_STATUSES.OPEN,
  CASE_STATUSES.IN_PROGRESS,
  CASE_STATUSES.CLOSED,
  CASE_STATUSES.REJECTED,
];

const PAYMENT_STATUS_ORDER = [
  PAYMENT_STATUSES.PENDING,
  PAYMENT_STATUSES.APPROVED,
  PAYMENT_STATUSES.REJECTED,
  PAYMENT_STATUSES.VOIDED,
];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function keyOf(v) {
  return v?.toString?.() || v || null;
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKeyOf(value) {
  const d = toDate(value) || new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabelOf(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Ascending list of the last `n` month keys, e.g. ['2026-04', ..., '2026-09']. */
function recentMonthKeys(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const admin = await isAdmin(user.uid);

    const [paymentsCollection, distributionsCollection, casesCollection, withdrawalsCollection, usersCollection] =
      await Promise.all([
        getCollection(COLLECTIONS.PAYMENTS),
        getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS),
        getCollection(COLLECTIONS.CASES),
        getCollection(COLLECTIONS.WITHDRAWALS),
        getCollection(COLLECTIONS.USERS),
      ]);

    const scope = admin ? {} : { handlerId: user.uid };
    const withdrawalScope = admin ? {} : { caseworkerUid: user.uid };

    const [payments, distributions, cases, withdrawals, actor] = await Promise.all([
      paymentsCollection.find(scope).toArray(),
      distributionsCollection.find(scope).toArray(),
      casesCollection.find(scope).toArray(),
      withdrawalsCollection.find(withdrawalScope).toArray(),
      admin ? Promise.resolve(null) : usersCollection.findOne({ uid: user.uid }),
    ]);

    // ---------------------------------------------------------------- payments
    const approvedPayments = payments.filter(
      (p) => (p.status || PAYMENT_STATUSES.PENDING) === PAYMENT_STATUSES.APPROVED
    );

    const totalReceived = round2(approvedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const totalVat = round2(approvedPayments.reduce((s, p) => s + (Number(p.vat) || 0), 0));
    const totalNet = round2(distributions.reduce((s, d) => s + (Number(d.net) || 0), 0));
    const totalHandler = round2(distributions.reduce((s, d) => s + (Number(d.handlerAmount) || 0), 0));
    const totalHq = round2(distributions.reduce((s, d) => s + (Number(d.hqAmount) || 0), 0));
    const totalEl = round2(distributions.reduce((s, d) => s + (Number(d.elAmount) || 0), 0));

    // ------------------------------------------------------------ monthly trend
    const months = recentMonthKeys(MONTHS_BACK);
    const trend = new Map(
      months.map((key) => [key, { key, gross: 0, vat: 0, net: 0, handler: 0, hq: 0, el: 0, count: 0 }])
    );

    for (const p of approvedPayments) {
      const row = trend.get(monthKeyOf(p.approvedAt || p.receivedAt || p.createdAt));
      if (!row) continue;
      row.gross += Number(p.amount) || 0;
      row.vat += Number(p.vat) || 0;
      row.count += 1;
    }

    for (const d of distributions) {
      const row = trend.get(monthKeyOf(d.createdAt));
      if (!row) continue;
      row.net += Number(d.net) || 0;
      row.handler += Number(d.handlerAmount) || 0;
      row.hq += Number(d.hqAmount) || 0;
      row.el += Number(d.elAmount) || 0;
    }

    const revenueTrend = months.map((key) => {
      const r = trend.get(key);
      const row = {
        key,
        label: monthLabelOf(key),
        gross: round2(r.gross),
        vat: round2(r.vat),
        net: round2(r.net),
        handler: round2(r.handler),
        count: r.count,
      };
      // Company splits stay admin-only.
      if (admin) {
        row.hq = round2(r.hq);
        row.el = round2(r.el);
      }
      return row;
    });

    const thisMonthKey = months[months.length - 1];
    const thisMonth = revenueTrend.find((r) => r.key === thisMonthKey) || {
      gross: 0,
      net: 0,
      handler: 0,
      count: 0,
    };

// -------------------------------------------------------- status breakdowns
    const paymentStatus = PAYMENT_STATUS_ORDER.map((status) => {
      const rows = payments.filter((p) => (p.status || PAYMENT_STATUSES.PENDING) === status);
      return {
        status,
        count: rows.length,
        amount: round2(rows.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
      };
    });

    const caseStatus = CASE_STATUS_ORDER.map((status) => ({
      status,
      count: cases.filter((c) => (c.status || CASE_STATUSES.OPEN) === status).length,
    }));

    const activeCases = cases.filter(
      (c) => c.status === CASE_STATUSES.OPEN || c.status === CASE_STATUSES.IN_PROGRESS
    ).length;

    const pendingPayments = payments.filter(
      (p) => (p.status || PAYMENT_STATUSES.PENDING) === PAYMENT_STATUSES.PENDING
    ).length;

    // ---------------------------------------------------------------- top cases
    const caseMap = new Map();
    const ensureCase = (k, seed) => {
      let row = caseMap.get(k);
      if (!row) {
        row = {
          caseId: k,
          caseNumber: seed.caseNumber || '—',
          caseTitle: seed.caseTitle || '',
          totalPaid: 0,
          net: 0,
          handler: 0,
          hq: 0,
          el: 0,
        };
        caseMap.set(k, row);
      }
      if (seed.caseNumber) row.caseNumber = seed.caseNumber;
      if (seed.caseTitle) row.caseTitle = seed.caseTitle;
      return row;
    };

    for (const p of approvedPayments) {
      const k = keyOf(p.caseId);
      if (!k) continue;
      ensureCase(k, p).totalPaid += Number(p.amount) || 0;
    }

    for (const d of distributions) {
      const k = keyOf(d.caseId);
      if (!k) continue;
      const row = ensureCase(k, d);
      row.net += Number(d.net) || 0;
      row.handler += Number(d.handlerAmount) || 0;
      row.hq += Number(d.hqAmount) || 0;
      row.el += Number(d.elAmount) || 0;
    }

    const topCases = [...caseMap.values()]
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 5)
      .map((r) => {
        const row = {
          caseId: r.caseId,
          caseNumber: r.caseNumber,
          caseTitle: r.caseTitle,
          totalPaid: round2(r.totalPaid),
          net: round2(r.net),
          handler: round2(r.handler),
        };
        if (admin) {
          row.hq = round2(r.hq);
          row.el = round2(r.el);
        }
        return row;
      });

    // --------------------------------------------- top caseworkers (admin only)
    let topHandlers = [];
    if (admin) {
      const handlerMap = new Map();
      for (const d of distributions) {
        const k = d.handlerId || 'unassigned';
        let row = handlerMap.get(k);
        if (!row) {
          row = { handlerId: k, handlerName: d.handlerName || 'Unassigned', net: 0, handler: 0 };
          handlerMap.set(k, row);
        }
        if (d.handlerName) row.handlerName = d.handlerName;
        row.net += Number(d.net) || 0;
        row.handler += Number(d.handlerAmount) || 0;
      }
      topHandlers = [...handlerMap.values()]
        .sort((a, b) => b.net - a.net)
        .slice(0, 5)
        .map((r) => ({ ...r, net: round2(r.net), handler: round2(r.handler) }));
    }

    // ------------------------------------------------------------------- cards
    let cards;

    if (admin) {
      const [totalUsers, activeCaseworkers, pendingRequests] = await Promise.all([
        usersCollection.countDocuments(),
        usersCollection.countDocuments({ role: 'caseworker', accountStatus: 'ACTIVE' }),
        usersCollection.countDocuments({ role: 'applicant', accountStatus: 'PENDING' }),
      ]);

      cards = {
        totalUsers,
        activeCaseworkers,
        pendingRequests,
        totalCases: cases.length,
        activeCases,
        pendingPayments,
        monthReceived: thisMonth.gross,
        monthNet: thisMonth.net,
        monthPaymentCount: thisMonth.count,
        totalReceived,
        totalVat,
        totalNet,
        totalHandler,
        totalHq,
        totalEl,
        pendingWithdrawals: withdrawals.filter(
          (w) => accountOf(w) === 'HANDLER' && w.status === 'PENDING'
        ).length,
        approvedWithdrawals: withdrawals.filter(
          (w) => accountOf(w) === 'HANDLER' && w.status === 'APPROVED'
        ).length,
        // Paid out to caseworkers only; branch payouts are reported separately.
        totalPaidOut: round2(
          withdrawals
            .filter((w) => accountOf(w) === 'HANDLER' && w.status === 'PAID')
            .reduce((s, w) => s + (Number(w.amount) || 0), 0)
        ),
        totalPaidOutCompany: round2(
          withdrawals
            .filter((w) => accountOf(w) !== 'HANDLER' && w.status === 'PAID')
            .reduce((s, w) => s + (Number(w.amount) || 0), 0)
        ),
        // Head Office / East London balances, ready to pay out.
        companyAccounts: COMPANY_ACCOUNTS.map((account) =>
          computeCompanyBalance(distributions, withdrawals, account)
        ),
      };
    } else {
      const balance = computeWalletBalance(distributions, withdrawals);

      cards = {
        myCases: cases.length,
        activeCases,
        totalEarnings: balance.totalEarned,
        availableBalance: balance.available,
        withdrawable: balance.withdrawable,
        reservedWithdrawals: balance.pendingWithdrawalTotal,
        totalWithdrawn: balance.totalWithdrawn,
        monthEarnings: thisMonth.handler,
        monthNet: thisMonth.net,
        monthPaymentCount: thisMonth.count,
        pendingPayments,
        approvedPayments: approvedPayments.length,
        handlerPercent: resolveSplit(actor).handlerParcentage,
      };
    }

    return NextResponse.json({
      success: true,
      role: admin ? 'admin' : 'caseworker',
      isAdmin: admin,
      monthsBack: MONTHS_BACK,
      generatedAt: new Date().toISOString(),
      cards,
      revenueTrend,
      paymentStatus,
      caseStatus,
      topCases,
      topHandlers,
      // Never sent to caseworkers - the firm profit split is internal only.
      splitBreakdown: admin
        ? [
            { name: 'Handler Share', value: totalHandler },
            { name: 'Head Office', value: totalHq },
            { name: 'East London', value: totalEl },
          ]
        : [],
    });
  } catch (error) {
    console.error('Dashboard Stats API Error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard statistics.' }, { status: 500 });
  }
}
