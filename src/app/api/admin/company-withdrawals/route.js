import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  ACCOUNT_LABELS,
  COMPANY_ACCOUNTS,
  accountOf,
  computeCompanyBalance,
  serializeWithdrawal,
} from '@/lib/wallet';

/**
 * Branch (Head Office / East London) payouts.
 *
 * Company money has no approver above it — only an admin can move it — so a
 * payout is booked directly as PAID with the method/reference used. A payout
 * recorded by mistake can be reversed, which releases the amount back into the
 * branch balance while keeping the row in the ledger for auditability.
 */

/** Current state of both branch accounts plus their payout history. */
async function loadState() {
  const [distributionsCollection, withdrawalsCollection] = await Promise.all([
    getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS),
    getCollection(COLLECTIONS.WITHDRAWALS),
  ]);

  const [distributions, withdrawals] = await Promise.all([
    distributionsCollection.find().toArray(),
    withdrawalsCollection.find().sort({ requestedAt: -1, createdAt: -1 }).toArray(),
  ]);

  return {
    distributions,
    withdrawals,
    accounts: COMPANY_ACCOUNTS.map((account) =>
      computeCompanyBalance(distributions, withdrawals, account)
    ),
  };
}

function companyRows(withdrawals) {
  return withdrawals.filter((w) => accountOf(w) !== 'HANDLER').map(serializeWithdrawal);
}

export async function GET(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;

  try {
    const { accounts, withdrawals } = await loadState();

    return NextResponse.json({
      success: true,
      accounts,
      withdrawals: companyRows(withdrawals),
    });
  } catch (error) {
    console.error('Company Withdrawals GET Error:', error);
    return NextResponse.json({ error: 'Failed to load branch accounts.' }, { status: 500 });
  }
}

/** Record a branch payout. Body: { account, amount, paymentMethod?, paymentReference?, note? } */
export async function POST(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json();
    const { account, amount, paymentMethod, paymentReference, note } = body;

    if (!COMPANY_ACCOUNTS.includes(account)) {
      return NextResponse.json(
        { error: `account must be one of: ${COMPANY_ACCOUNTS.join(', ')}.` },
        { status: 400 }
      );
    }

    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
      return NextResponse.json(
        { error: 'Withdrawal amount must be a positive number.' },
        { status: 400 }
      );
    }

    const { distributions, withdrawals, accounts } = await loadState();
    const balance = accounts.find((a) => a.account === account);

    if (requested > balance.withdrawable + 0.001) {
      return NextResponse.json(
        {
          error: `${balance.label} can only release £${Math.max(0, balance.withdrawable).toFixed(2)} right now.`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const withdrawalDoc = {
      account,
      caseworkerUid: null,
      caseworkerName: ACCOUNT_LABELS[account] || account,
      amount: requested,
      status: 'PAID',
      paymentMethod: paymentMethod || null,
      paymentReference: paymentReference || null,
      note: note || null,
      requestedAt: now,
      reviewedAt: now,
      reviewedBy: actor.uid,
      paidAt: now,
      paidBy: actor.uid,
      createdAt: now,
    };

    const withdrawalsCollection = await getCollection(COLLECTIONS.WITHDRAWALS);
    const result = await withdrawalsCollection.insertOne(withdrawalDoc);

    await writeAudit({
      action: 'COMPANY_WITHDRAWAL_PAID',
      actorUid: actor.uid,
      account,
      withdrawalId: result.insertedId.toString(),
      amount: requested,
      balanceBefore: balance.withdrawable,
      paymentMethod: paymentMethod || null,
      paymentReference: paymentReference || null,
      note: note || null,
    });

    const refreshed = COMPANY_ACCOUNTS.map((a) =>
      computeCompanyBalance(distributions, withdrawals.concat([withdrawalDoc]), a)
    );

    return NextResponse.json(
      {
        success: true,
        message: `${ACCOUNT_LABELS[account]} payout of £${requested.toFixed(2)} recorded.`,
        withdrawal: serializeWithdrawal({ ...withdrawalDoc, _id: result.insertedId }),
        accounts: refreshed,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Company Withdrawals POST Error:', error);
    return NextResponse.json({ error: 'Failed to record branch payout.' }, { status: 500 });
  }
}

/** Reverse a branch payout. Body: { withdrawalId, action: 'reverse', reason? } */
export async function PATCH(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json();
    const { withdrawalId, action, reason } = body;

    if (!withdrawalId || action !== 'reverse') {
      return NextResponse.json(
        { error: "withdrawalId and action 'reverse' are required." },
        { status: 400 }
      );
    }

    const withdrawalsCollection = await getCollection(COLLECTIONS.WITHDRAWALS);

    let withdrawal;
    try {
      withdrawal = await withdrawalsCollection.findOne({ _id: new ObjectId(withdrawalId) });
    } catch {
      return NextResponse.json({ error: 'Invalid withdrawal id.' }, { status: 400 });
    }

    if (!withdrawal) {
      return NextResponse.json({ error: 'Payout not found.' }, { status: 404 });
    }

    if (accountOf(withdrawal) === 'HANDLER') {
      return NextResponse.json(
        { error: 'Only Head Office / East London payouts can be reversed here.' },
        { status: 400 }
      );
    }

    if (withdrawal.status !== 'PAID') {
      return NextResponse.json(
        { error: 'Only paid branch payouts can be reversed.' },
        { status: 400 }
      );
    }

    const now = new Date();
    await withdrawalsCollection.updateOne(
      { _id: withdrawal._id },
      {
        $set: {
          status: 'REJECTED',
          reversedAt: now,
          reversedBy: actor.uid,
          reversalReason: reason || null,
          updatedAt: now,
        },
      }
    );

    await writeAudit({
      action: 'COMPANY_WITHDRAWAL_REVERSED',
      actorUid: actor.uid,
      account: accountOf(withdrawal),
      withdrawalId: withdrawal._id.toString(),
      amount: withdrawal.amount,
      reason: reason || null,
    });

    const { distributions, withdrawals, accounts } = await loadState();

    return NextResponse.json({
      success: true,
      message: 'Payout reversed. The amount is available to the branch again.',
      withdrawal: serializeWithdrawal(await withdrawalsCollection.findOne({ _id: withdrawal._id })),
      accounts: accounts.map((a) => computeCompanyBalance(distributions, withdrawals, a.account)),
    });
  } catch (error) {
    console.error('Company Withdrawals PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to reverse branch payout.' }, { status: 500 });
  }
}