import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { computeWalletBalance, serializeWithdrawal } from '@/lib/wallet';
import { notifyWithdrawalRequested } from '@/lib/email/notifications';

/**
 * Requests a withdrawal from the caller's own wallet.
 *
 * An admin can hold the case-handler role too, so they draw from the same
 * personal wallet. What keeps this safe is the balance guard below: the amount
 * is always checked against the caller's *own* computed withdrawable balance,
 * so nobody can draw more than they earned, and a personal request never touches
 * HQ / East London money (those ledgers are only paid out through
 * /api/admin/company-withdrawals).
 *
 * The money only leaves the wallet once an admin marks the request PAID.
 * APPROVED merely reserves it against the balance so the same money cannot be
 * requested twice.
 */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const { amount } = body;

    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
      return NextResponse.json(
        { error: 'Withdrawal amount must be a positive number.' },
        { status: 400 }
      );
    }

    const distributionsCollection = await getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS);
    const withdrawalsCollection = await getCollection(COLLECTIONS.WITHDRAWALS);

    const [distributions, withdrawals, userDoc] = await Promise.all([
      distributionsCollection.find({ handlerId: user.uid }).toArray(),
      withdrawalsCollection.find({ caseworkerUid: user.uid }).toArray(),
      getCollection(COLLECTIONS.USERS).then((c) => c.findOne({ uid: user.uid })),
    ]);

    const balance = computeWalletBalance(distributions, withdrawals);
    if (requested > balance.withdrawable + 0.001) {
      return NextResponse.json(
        {
          error: `You can withdraw up to £${balance.withdrawable.toFixed(2)}.`,
        },
        { status: 400 }
      );
    }

    const withdrawalDoc = {
      caseworkerUid: user.uid,
      caseworkerName: userDoc?.fullName || user.displayName || 'Caseworker',
      amount: requested,
      status: 'PENDING',
      requestedAt: new Date(),
      createdAt: new Date(),
    };

    const result = await withdrawalsCollection.insertOne(withdrawalDoc);

    await writeAudit({
      action: 'WITHDRAWAL_REQUESTED',
      actorUid: user.uid,
      targetUid: user.uid,
      withdrawalId: result.insertedId.toString(),
      amount: requested,
    });

    // The request is committed, so the payout desk can be told there is work
    // waiting. The response below is unaffected by what the mail server does.
    await notifyWithdrawalRequested({
      withdrawal: { ...withdrawalDoc, _id: result.insertedId },
      actorUid: user.uid,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Withdrawal requested. It will be processed once approved by the admin.',
        withdrawal: serializeWithdrawal({ ...withdrawalDoc, _id: result.insertedId }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Withdraw POST Error:', error);
    return NextResponse.json({ error: 'Failed to request withdrawal.' }, { status: 500 });
  }
}