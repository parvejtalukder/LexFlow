import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { isAdmin } from '@/lib/cases';
import { computeWalletBalance, serializeWithdrawal } from '@/lib/wallet';

/**
 * Caseworker requests a withdrawal from their wallet.
 * The money only leaves the wallet once an admin marks the request PAID.
 * APPROVED merely reserves it against the balance so the same money cannot be
 * requested twice.
 */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  if (await isAdmin(user.uid)) {
    return NextResponse.json(
      { error: 'Admins do not have a personal wallet to withdraw from.' },
      { status: 400 }
    );
  }

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