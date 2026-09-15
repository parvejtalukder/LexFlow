/**
 * Financial engine: VAT, net, and profit-sharing calculations.
 *
 * Percentages are read dynamically from the assigned handler's User record
 * (handlerParcentage / hqParcentage / elParcentage) and snapshotted onto each
 * ProfitDistribution at payment time so future edits never rewrite history.
 */

const DEFAULT_SPLITS = {
  admin: { handlerParcentage: 50, hqParcentage: 30, elParcentage: 20 },
  caseworker: { handlerParcentage: 50, hqParcentage: 10, elParcentage: 40 },
};

/**
 * Lifecycle of a payment record. Money only becomes "real" (VAT split, profit
 * distribution, wallet credit) once a submission moves to APPROVED.
 *   PENDING   -> caseworker submitted, awaiting admin review
 *   APPROVED  -> admin approved; distribution + wallet credit created
 *   REJECTED  -> admin rejected (can be edited & resubmitted)
 *   VOIDED    -> an APPROVED payment later cancelled (distribution removed)
 */
export const PAYMENT_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VOIDED: 'VOIDED',
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Round to 2 decimals (half up). Exported so callers that render money outside
 * this module use the exact same rounding as the VAT/distribution engine.
 */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * VAT = R * (20 / 120); Net = R - VAT.
 * vatApplicable === false → vat 0, net = R.
 *
 * NOTE: vat and net are rounded independently, so on roughly 10% of amounts
 * (e.g. R = £12.09 → vat £2.01 + net £10.07 = £12.08) the pair does not add back
 * up to the gross by one penny; on others it adds a penny. This only affects the
 * display/ledger of vat vs net, never the money allocated (distribute() always
 * splits the stored net exactly), but it is a known reconciliation gap.
 */
export function calculateVatAndNet(amount, vatApplicable) {
  const R = Number(amount);
  const vat = vatApplicable ? R * (20 / 120) : 0;
  const net = R - vat;
  return { vat: round2(vat), net: round2(net) };
}

/**
 * Resolve the active profit-sharing percentages for a handler.
 * Falls back to the standard split for the handler type when unconfigured
 * or when the configured percentages do not total exactly 100%.
 */
export function resolveSplit(userDoc) {
  const type = userDoc?.role === 'admin' ? 'admin' : 'caseworker';
  const defaults = DEFAULT_SPLITS[type] || DEFAULT_SPLITS.caseworker;

  const hp = toNum(userDoc?.handlerParcentage);
  const hq = toNum(userDoc?.hqParcentage);
  const el = toNum(userDoc?.elParcentage);

  if (hp == null || hq == null || el == null) {
    return { ...defaults, fallback: true };
  }

  const total = hp + hq + el;
  if (Math.abs(total - 100) > 0.001) {
    return { ...defaults, fallback: true };
  }

  return { handlerParcentage: hp, hqParcentage: hq, elParcentage: el, fallback: false };
}

/**
 * Split the net amount into the three buckets using the given percentages.
 *
 * A single total is allocated in pence with the largest-remainder method, so
 * handlerAmount + hqAmount + elAmount === round2(net) exactly. Rounding each
 * bucket independently could total a penny more or less than the net amount
 * (e.g. £116.67 at 50/10/40 summed to £116.68), which leaked that penny into
 * the wallets and branch balances. Any leftover pennies go to the largest
 * fractional remainders; ties resolve in handler -> HQ -> EL order.
 */
export function distribute(net, split) {
  const totalCents = Math.round(round2(toNum(net) ?? 0) * 100);
  const percentages = [split.handlerParcentage, split.hqParcentage, split.elParcentage].map(
    (p) => toNum(p) || 0
  );

  // Exact value of each share in pence, then floor them all to whole pence.
  const exact = percentages.map((p) => (totalCents * p) / 100);
  const cents = exact.map((v) => Math.floor(v + 1e-9));
  let leftover = totalCents - cents.reduce((sum, c) => sum + c, 0);

  // Hand the leftover pennies to the biggest fractional remainders first.
  const byRemainder = exact
    .map((v, i) => ({ i, remainder: v - Math.floor(v + 1e-9) }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);

  for (const { i } of byRemainder) {
    if (leftover <= 0) break;
    cents[i] += 1;
    leftover -= 1;
  }

  return {
    handlerAmount: cents[0] / 100,
    hqAmount: cents[1] / 100,
    elAmount: cents[2] / 100,
  };
}

/**
 * When isVat is true, auto-add 20% VAT of the entered (net) deal price.
 * The result is the gross total the client pays (collected in terms).
 */
export function calculateDealVat(dealPrice, isVat) {
  const base = Number(dealPrice) || 0;
  const vatAmount = isVat ? round2(base * 0.2) : 0;
  return { vatAmount, totalAmount: round2(base + vatAmount) };
}

/**
 * Calculate how much of a case's total (gross) price has been paid and what
 * remains. Only APPROVED payments count as received money.
 */
export function calculateCaseBalance(totalToCollect, payments) {
  const totalPaid = (payments || [])
    .filter((p) => (p.status || PAYMENT_STATUSES.PENDING) === PAYMENT_STATUSES.APPROVED)
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const remaining = round2((Number(totalToCollect) || 0) - totalPaid);
  return {
    totalPaid: round2(totalPaid),
    remaining,
    termCount: (payments || []).length,
  };
}

/**
 * Sum the payments that still hold a slice of the deal price — PENDING
 * (awaiting review) and, when includeApproved is true, APPROVED (received).
 * REJECTED and VOIDED payments release their reservation.
 */
export function sumCommitted(payments, includeApproved = true) {
  return round2(
    (payments || []).reduce((sum, p) => {
      const status = p.status || PAYMENT_STATUSES.PENDING;
      if (status === PAYMENT_STATUSES.PENDING) return sum + (Number(p.amount) || 0);
      if (includeApproved && status === PAYMENT_STATUSES.APPROVED) return sum + (Number(p.amount) || 0);
      return sum;
    }, 0)
  );
}

export function serializePayment(p) {
  return {
    id: p._id.toString(),
    caseId: p.caseId?.toString?.() || p.caseId || null,
    caseNumber: p.caseNumber || null,
    caseTitle: p.caseTitle || null,
    clientName: p.clientName || null,
    handlerId: p.handlerId || null,
    handlerName: p.handlerName || null,
    handlerType: p.handlerType || null,
    amount: p.amount,
    vatApplicable: !!p.vatApplicable,
    vat: p.vat ?? null,
    net: p.net ?? null,
    termNumber: p.termNumber || null,
    reference: p.reference || null,
    description: p.description || null,
    paymentMethod: p.paymentMethod || null,
    status: p.status || PAYMENT_STATUSES.PENDING,
    recordedBy: p.recordedBy || null,
    approvedBy: p.approvedBy || null,
    approvedAt: p.approvedAt || null,
    rejectionReason: p.rejectionReason || null,
    receivedAt: p.receivedAt,
    createdAt: p.createdAt,
  };
}

export function serializeDistribution(d, includeCompanySplits = true) {
  const base = {
    id: d._id.toString(),
    paymentId: d.paymentId?.toString?.() || d.paymentId || null,
    caseId: d.caseId?.toString?.() || d.caseId || null,
    caseNumber: d.caseNumber || null,
    handlerId: d.handlerId || null,
    handlerName: d.handlerName || null,
    handlerType: d.handlerType || null,
    net: d.net,
    handlerParcentage: d.handlerParcentage,
    handlerAmount: d.handlerAmount,
    createdAt: d.createdAt,
  };
  if (includeCompanySplits) {
    base.hqParcentage = d.hqParcentage;
    base.elParcentage = d.elParcentage;
    base.hqAmount = d.hqAmount;
    base.elAmount = d.elAmount;
  }
  return base;
}
