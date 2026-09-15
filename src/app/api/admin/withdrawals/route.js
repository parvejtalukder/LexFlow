import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { serializeWithdrawal } from '@/lib/wallet';
import { writeAudit } from '@/lib/audit';

export async function GET(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;

  try {
    const withdrawalsCollection = await getCollection(COLLECTIONS.WITHDRAWALS);
    const withdrawals = await withdrawalsCollection
      .find()
      .sort({ requestedAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      withdrawals: withdrawals.map(serializeWithdrawal),
    });
  } catch (error) {
    console.error('Admin Withdrawals GET Error:', error);
    return NextResponse.json({ error: 'Failed to load withdrawals.' }, { status: 500 });
  }
}

/**
 * Admin reviews a caseworker's withdrawal request.
 *   approve: PENDING  -> APPROVED (verified; money reserved, not yet paid)
 *   pay:     APPROVED -> PAID     (money actually paid; wallet reduced)
 *   reject:  PENDING  -> REJECTED (reserved amount released)
 */
export async function PATCH(request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json();
    const { withdrawalId, action, note, paymentMethod, paymentReference } = body;

    if (!withdrawalId || !['approve', 'reject', 'pay'].includes(action)) {
      return NextResponse.json(
        { error: "withdrawalId and action ('approve' | 'reject' | 'pay') are required." },
        { status: 400 }
      );
    }

    const { ObjectId } = await import('mongodb');
    const withdrawalsCollection = await getCollection(COLLECTIONS.WITHDRAWALS);
    let withdrawal;
    try {
      withdrawal = await withdrawalsCollection.findOne({ _id: new ObjectId(withdrawalId) });
    } catch {
      return NextResponse.json({ error: 'Invalid withdrawal id.' }, { status: 400 });
    }

    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal request not found.' }, { status: 404 });
    }

    const now = new Date();
    let update;
    if (action === 'approve') {
      if (withdrawal.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only pending withdrawals can be approved.' }, { status: 400 });
      }
      update = { status: 'APPROVED', reviewedAt: now, reviewedBy: actor.uid, note: note || withdrawal.note || null };
    } else if (action === 'pay') {
      if (withdrawal.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Only approved withdrawals can be marked as paid.' }, { status: 400 });
      }
      update = {
        status: 'PAID',
        paidAt: now,
        paidBy: actor.uid,
        paymentMethod: paymentMethod || withdrawal.paymentMethod || null,
        paymentReference: paymentReference || withdrawal.paymentReference || null,
      };
    } else {
      if (withdrawal.status !== 'PENDING') {
        return NextResponse.json({ error: 'Only pending withdrawals can be rejected.' }, { status: 400 });
      }
      update = { status: 'REJECTED', reviewedAt: now, reviewedBy: actor.uid, note: note || null };
    }

    await withdrawalsCollection.updateOne({ _id: withdrawal._id }, { $set: update });

    const auditAction =
      action === 'approve'
        ? 'WITHDRAWAL_APPROVED'
        : action === 'pay'
        ? 'WITHDRAWAL_PAID'
        : 'WITHDRAWAL_REJECTED';

    await writeAudit({
      action: auditAction,
      actorUid: actor.uid,
      targetUid: withdrawal.caseworkerUid,
      withdrawalId: withdrawal._id.toString(),
      amount: withdrawal.amount,
      note: note || null,
      paymentMethod: paymentMethod || null,
      paymentReference: paymentReference || null,
    });

    const updated = await withdrawalsCollection.findOne({ _id: withdrawal._id });

    const messages = {
      approve: 'Withdrawal approved. Mark it as paid once the funds have been sent.',
      pay: 'Withdrawal marked as paid. The caseworker wallet has been reduced.',
      reject: 'Withdrawal rejected. The reserved amount has been released.',
    };

    return NextResponse.json({
      success: true,
      message: messages[action],
      withdrawal: serializeWithdrawal(updated),
    });
  } catch (error) {
    console.error('Admin Withdrawals PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to review withdrawal.' }, { status: 500 });
  }
}