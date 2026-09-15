/**
 * Wallet helpers: balances and serialization.
 *
 * A caseworker's wallet balance is derived entirely from calculated figures:
 *   available    = totalEarned (handler share of APPROVED payments)
 *                  − totalWithdrawn (PAID withdrawals only)
 *   reserved     = PENDING + APPROVED withdrawals (requested but not yet paid)
 *   withdrawable = available − reserved
 * Money is only removed from the wallet once an admin marks a withdrawal PAID.
 */

const WITHDRAWAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
};

/**
 * Where a payout came from.
 *   HANDLER -> a caseworker's personal wallet (also the implied value for rows
 *              created before branch accounts existed)
 *   HQ / EL -> the firm's Head Office / East London branch account, funded by
 *              the company share (hqAmount / elAmount) of every profit split.
 */
export const HANDLER_ACCOUNT = 'HANDLER';
export const COMPANY_ACCOUNTS = ['HQ', 'EL'];
export const ACCOUNT_LABELS = {
  HANDLER: 'Caseworker',
  HQ: 'Head Office',
  EL: 'East London',
};

/** Resolve a withdrawal's account, defaulting legacy rows to the handler wallet. */
export function accountOf(withdrawal) {
  const account = withdrawal?.account;
  return account === 'HQ' || account === 'EL' ? account : HANDLER_ACCOUNT;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Balance of a branch (Head Office / East London) account.
 *
 * Unlike a caseworker wallet there is no approval step: only an admin can move
 * company money, so a payout is recorded directly as PAID and simply reduces
 * what is left. A payout that was recorded by mistake can be reversed
 * (status REJECTED) which puts the amount straight back.
 *
 *   earned       = company share of every profit distribution
 *                  (hqAmount for HQ, elAmount for EL)
 *   paid         = PAID payouts booked against the account
 *   withdrawable = earned − paid
 */
export function computeCompanyBalance(distributions, withdrawals, account) {
  const shareOf = (d) => (account === 'HQ' ? d.hqAmount : d.elAmount);

  const earned = (distributions || []).reduce((sum, d) => sum + (Number(shareOf(d)) || 0), 0);

  const rows = (withdrawals || []).filter((w) => accountOf(w) === account);
  const paid = rows
    .filter((w) => w.status === WITHDRAWAL_STATUS.PAID)
    .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  return {
    account,
    label: ACCOUNT_LABELS[account] || account,
    earned: round2(earned),
    paid: round2(paid),
    // Can go negative if an approved payment was later voided after a payout.
    withdrawable: round2(earned - paid),
    payoutCount: rows.filter((w) => w.status === WITHDRAWAL_STATUS.PAID).length,
  };
}

export function computeWalletBalance(distributions, withdrawals) {
  const totalEarned = (distributions || []).reduce(
    (sum, d) => sum + (Number(d.handlerAmount) || 0),
    0
  );

  // Company (HQ / East London) payouts live in the same collection but must
  // never affect a personal wallet, so they are filtered out here.
  const handlerWithdrawals = (withdrawals || []).filter(
    (w) => accountOf(w) === HANDLER_ACCOUNT
  );

  // Money actually paid out to the caseworker.
  const totalWithdrawn = handlerWithdrawals
    .filter((w) => w.status === WITHDRAWAL_STATUS.PAID)
    .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  // Requested/approved but not yet paid — held back so it can't be re-requested.
  const pendingWithdrawalTotal = handlerWithdrawals
    .filter((w) => w.status === WITHDRAWAL_STATUS.PENDING || w.status === WITHDRAWAL_STATUS.APPROVED)
    .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  const available = round2(totalEarned - totalWithdrawn);
  const withdrawable = round2(available - pendingWithdrawalTotal);

  return {
    totalEarned: round2(totalEarned),
    totalWithdrawn: round2(totalWithdrawn),
    pendingWithdrawalTotal: round2(pendingWithdrawalTotal),
    available,
    withdrawable,
  };
}

export function serializeWithdrawal(w) {
  return {
    id: w._id?.toString?.() || w._id,
    account: accountOf(w),
    caseworkerUid: w.caseworkerUid || null,
    caseworkerName: w.caseworkerName || null,
    amount: w.amount,
    status: w.status,
    paymentMethod: w.paymentMethod || null,
    paymentReference: w.paymentReference || null,
    note: w.note || null,
    requestedAt: w.requestedAt,
    reviewedAt: w.reviewedAt || null,
    reviewedBy: w.reviewedBy || null,
    paidAt: w.paidAt || null,
    paidBy: w.paidBy || null,
    reversedAt: w.reversedAt || null,
    reversedBy: w.reversedBy || null,
    reversalReason: w.reversalReason || null,
    createdAt: w.createdAt,
  };
}