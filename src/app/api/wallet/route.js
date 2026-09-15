import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isAdmin, findHandlerByUid } from '@/lib/cases';
import { serializeDistribution, resolveSplit } from '@/lib/finance';
import {
  COMPANY_ACCOUNTS,
  accountOf,
  computeCompanyBalance,
  computeWalletBalance,
  serializeWithdrawal,
} from '@/lib/wallet';

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function keyOf(v) {
  return v?.toString?.() || v || null;
}

function buildActivity(distributions, withdrawals, limit = 50) {
  const income = (distributions || []).map((d) => ({
    type: 'INCOME',
    id: keyOf(d._id),
    date: d.createdAt,
    amount: d.handlerAmount,
    net: d.net,
    caseNumber: d.caseNumber,
    status: 'APPROVED',
  }));
  const wd = (withdrawals || []).map((w) => ({
    type: 'WITHDRAWAL',
    id: keyOf(w._id),
    date: w.requestedAt || w.createdAt,
    amount: w.amount,
    status: w.status,
  }));
  return [...income, ...wd]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const admin = await isAdmin(user.uid);

  const distributionsCollection = await getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS);
  const paymentsCollection = await getCollection(COLLECTIONS.PAYMENTS);
  const withdrawalsCollection = await getCollection(COLLECTIONS.WITHDRAWALS);

  try {
    // ---- ADMIN: overall firm wallet ---------------------------------------
    if (admin) {
      const [distributions, payments, withdrawals] = await Promise.all([
        distributionsCollection.find().sort({ createdAt: -1 }).toArray(),
        paymentsCollection.find().sort({ receivedAt: -1 }).toArray(),
        withdrawalsCollection.find().sort({ requestedAt: -1 }).toArray(),
      ]);

      // Only APPROVED payments represent money actually received by the firm.
      const approvedPayments = payments.filter((p) => p.status === 'APPROVED');

      // Caseworker payouts and branch (HQ / EL) payouts share one collection but
      // are reported separately so "Paid Out" keeps meaning "paid to handlers".
      const handlerWithdrawals = withdrawals.filter((w) => accountOf(w) === 'HANDLER');
      const companyWithdrawals = withdrawals.filter((w) => accountOf(w) !== 'HANDLER');
      const paidTotal = (rows) =>
        round2(
          rows
            .filter((w) => w.status === 'PAID')
            .reduce((s, w) => s + (Number(w.amount) || 0), 0)
        );

      const summary = {
        totalReceived: round2(approvedPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
        totalVat: round2(approvedPayments.reduce((s, p) => s + (Number(p.vat) || 0), 0)),
        totalNet: round2(distributions.reduce((s, d) => s + (Number(d.net) || 0), 0)),
        totalHandler: round2(distributions.reduce((s, d) => s + (Number(d.handlerAmount) || 0), 0)),
        totalHq: round2(distributions.reduce((s, d) => s + (Number(d.hqAmount) || 0), 0)),
        totalEl: round2(distributions.reduce((s, d) => s + (Number(d.elAmount) || 0), 0)),
        // PAID = money actually sent to a caseworker; PENDING/APPROVED are
        // reserved against a wallet but not yet paid out. Branch payouts are
        // tracked separately (totalWithdrawnCompany) so this stays handler-only.
        totalWithdrawn: paidTotal(handlerWithdrawals),
        totalWithdrawnCompany: paidTotal(companyWithdrawals),
        totalReserved: round2(
          handlerWithdrawals
            .filter((w) => w.status === 'PENDING' || w.status === 'APPROVED')
            .reduce((s, w) => s + (Number(w.amount) || 0), 0)
        ),
        pendingWithdrawals: handlerWithdrawals.filter((w) => w.status === 'PENDING').length,
        approvedWithdrawals: handlerWithdrawals.filter((w) => w.status === 'APPROVED').length,
        companyPayoutCount: companyWithdrawals.filter((w) => w.status === 'PAID').length,
        pendingPayments: payments.filter((p) => p.status === 'PENDING').length,
        paymentCount: payments.length,
        caseCount: new Set(distributions.map((d) => keyOf(d.caseId))).size,
      };

      // Per-case aggregates (approved money only).
      const caseMap = {};
      for (const p of approvedPayments) {
        const k = keyOf(p.caseId);
        const c = (caseMap[k] ||= {
          caseId: k,
          caseNumber: p.caseNumber,
          caseTitle: p.caseTitle,
          clientName: p.clientName,
          handlerName: p.handlerName,
          totalPaid: 0,
          vat: 0,
          net: 0,
          handlerShare: 0,
        });
        c.totalPaid = round2(c.totalPaid + (Number(p.amount) || 0));
        c.vat = round2(c.vat + (Number(p.vat) || 0));
      }
      for (const d of distributions) {
        const k = keyOf(d.caseId);
        const c = (caseMap[k] ||= {
          caseId: k,
          caseNumber: d.caseNumber,
          caseTitle: '',
          clientName: '',
          handlerName: d.handlerName,
          totalPaid: 0,
          vat: 0,
          net: 0,
          handlerShare: 0,
        });
        c.net = round2(c.net + (Number(d.net) || 0));
        c.handlerShare = round2(c.handlerShare + (Number(d.handlerAmount) || 0));
      }
      const byCase = Object.values(caseMap);
// Per-handler aggregates.
      const handlerMap = {};
      for (const d of distributions) {
        const k = d.handlerId;
        const h = (handlerMap[k] ||= {
          handlerId: k,
          handlerName: d.handlerName,
          handlerType: d.handlerType,
          totalNet: 0,
          handlerShare: 0,
          hqShare: 0,
          elShare: 0,
          withdrawn: 0,
          reserved: 0,
          caseSet: new Set(),
        });
        h.totalNet = round2(h.totalNet + (Number(d.net) || 0));
        h.handlerShare = round2(h.handlerShare + (Number(d.handlerAmount) || 0));
        h.hqShare = round2(h.hqShare + (Number(d.hqAmount) || 0));
        h.elShare = round2(h.elShare + (Number(d.elAmount) || 0));
        h.caseSet.add(keyOf(d.caseId));
      }
      for (const w of handlerWithdrawals) {
        if (w.status === 'PAID' && handlerMap[w.caseworkerUid]) {
          handlerMap[w.caseworkerUid].withdrawn = round2(
            handlerMap[w.caseworkerUid].withdrawn + (Number(w.amount) || 0)
          );
        }
        if ((w.status === 'PENDING' || w.status === 'APPROVED') && handlerMap[w.caseworkerUid]) {
          handlerMap[w.caseworkerUid].reserved = round2(
            (handlerMap[w.caseworkerUid].reserved || 0) + (Number(w.amount) || 0)
          );
        }
      }
      const byHandler = Object.values(handlerMap).map(({ caseSet, ...h }) => ({
        ...h,
        caseCount: caseSet.size,
      }));

      return NextResponse.json({
        success: true,
        role: 'admin',
        summary,
        // Branch (Head Office / East London) accounts — money the firm itself
        // has earned and can pay out via /api/admin/company-withdrawals.
        company: COMPANY_ACCOUNTS.map((account) =>
          computeCompanyBalance(distributions, withdrawals, account)
        ),
        byCase,
        byHandler,
        withdrawals: withdrawals.map(serializeWithdrawal),
        recent: distributions.slice(0, 25).map((d) => serializeDistribution(d, true)),
        activity: buildActivity(distributions, handlerWithdrawals),
      });
    }

    // ---- CASEWORKER: personal wallet --------------------------------------
    const [distributions, payments, withdrawals, userDoc] = await Promise.all([
      distributionsCollection.find({ handlerId: user.uid }).sort({ createdAt: -1 }).toArray(),
      paymentsCollection.find({ handlerId: user.uid }).sort({ receivedAt: -1 }).toArray(),
      withdrawalsCollection.find({ caseworkerUid: user.uid }).sort({ requestedAt: -1 }).toArray(),
      findHandlerByUid(user.uid),
    ]);

    const balance = computeWalletBalance(distributions, withdrawals);

    const approvedPayments = payments.filter((p) => p.status === 'APPROVED');

    const caseMap = {};
    for (const p of approvedPayments) {
      const k = keyOf(p.caseId);
      const c = (caseMap[k] ||= {
        caseId: k,
        caseNumber: p.caseNumber,
        caseTitle: p.caseTitle,
        totalPaid: 0,
        net: 0,
        handlerShare: 0,
      });
      c.totalPaid = round2(c.totalPaid + (Number(p.amount) || 0));
    }
    for (const d of distributions) {
      const k = keyOf(d.caseId);
      const c = (caseMap[k] ||= {
        caseId: k,
        caseNumber: d.caseNumber,
        caseTitle: '',
        totalPaid: 0,
        net: 0,
        handlerShare: 0,
      });
      c.net = round2(c.net + (Number(d.net) || 0));
      c.handlerShare = round2(c.handlerShare + (Number(d.handlerAmount) || 0));
    }

    const caseCount = new Set(distributions.map((d) => keyOf(d.caseId))).size;

    // Caseworker's own handler percentage, for the revenue calculator.
    const handlerPercent = resolveSplit(userDoc).handlerParcentage;

    return NextResponse.json({
      success: true,
      role: 'caseworker',
      summary: {
        ...balance,
        handlerPercent,
        paymentCount: approvedPayments.length,
        pendingPayments: payments.filter((p) => p.status === 'PENDING').length,
        caseCount,
      },
      byCase: Object.values(caseMap),
      withdrawals: withdrawals.map(serializeWithdrawal),
      recent: distributions.slice(0, 25).map((d) => serializeDistribution(d, false)),
      activity: buildActivity(distributions, withdrawals),
    });
  } catch (error) {
    console.error('Wallet GET Error:', error);
    return NextResponse.json({ error: 'Failed to load wallet.' }, { status: 500 });
  }
}