import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { findCase, findHandlerByUid } from '@/lib/cases';
import {
  calculateVatAndNet,
  distribute,
  resolveSplit,
  PAYMENT_STATUSES,
  serializePayment,
} from '@/lib/finance';

/**
 * Admin review of a submitted payment.
 * Body: { action: 'approve' | 'reject' | 'void', rejectionReason? }
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json();
    const { action, rejectionReason } = body;

    if (!['approve', 'reject', 'void'].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve', 'reject' or 'void'." },
        { status: 400 }
      );
    }

    const paymentsCollection = await getCollection(COLLECTIONS.PAYMENTS);
    const distributionsCollection = await getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS);
    const payment = await paymentsCollection.findOne({ _id: new ObjectId(id) });
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    }
    const now = new Date();

    if (action === 'reject') {
      if (payment.status !== PAYMENT_STATUSES.PENDING) {
        return NextResponse.json({ error: 'Only pending payments can be rejected.' }, { status: 400 });
      }
      await paymentsCollection.updateOne(
        { _id: payment._id },
        { $set: { status: PAYMENT_STATUSES.REJECTED, rejectionReason: rejectionReason || null, approvedBy: null, approvedAt: null } }
      );
      await writeAudit({
        action: 'PAYMENT_REJECTED',
        actorUid: actor.uid,
        caseId: payment.caseId?.toString?.(),
        paymentId: payment._id.toString(),
        amount: payment.amount,
        rejectionReason: rejectionReason || null,
      });
      return NextResponse.json({ success: true, payment: serializePayment(await paymentsCollection.findOne({ _id: payment._id })) });
    }

    if (action === 'void') {
      if (payment.status === PAYMENT_STATUSES.VOIDED) {
        return NextResponse.json({ error: 'Payment is already voided.' }, { status: 400 });
      }
      if (payment.status !== PAYMENT_STATUSES.APPROVED && payment.status !== PAYMENT_STATUSES.PENDING) {
        return NextResponse.json({ error: 'Only approved or pending payments can be voided.' }, { status: 400 });
      }
      await paymentsCollection.updateOne({ _id: payment._id }, { $set: { status: PAYMENT_STATUSES.VOIDED } });
      await distributionsCollection.deleteOne({ paymentId: payment._id });
      await writeAudit({
        action: 'PAYMENT_VOIDED',
        actorUid: actor.uid,
        caseId: payment.caseId?.toString?.(),
        paymentId: payment._id.toString(),
        amount: payment.amount,
      });
      return NextResponse.json({ success: true, payment: serializePayment(await paymentsCollection.findOne({ _id: payment._id })) });
    }

    // approve
    if (payment.status !== PAYMENT_STATUSES.PENDING) {
      return NextResponse.json({ error: 'Only pending payments can be approved.' }, { status: 400 });
    }

    const c = await findCase(payment.caseId?.toString?.() || payment.caseId);
    if (!c) {
      return NextResponse.json({ error: 'Underlying case not found.' }, { status: 400 });
    }
    const handler = await findHandlerByUid(c.handlerId);
    if (!handler) {
      return NextResponse.json({ error: 'Case handler not found.' }, { status: 400 });
    }

    const vatApplicable = !!c.isVat;
    const { vat, net } = calculateVatAndNet(Number(payment.amount), vatApplicable);
    const split = resolveSplit(handler);
    const amounts = distribute(net, split);

    await distributionsCollection.insertOne({
      paymentId: payment._id,
      caseId: c._id,
      caseNumber: c.caseNumber,
      handlerId: c.handlerId,
      handlerName: c.handlerName,
      handlerType: c.handlerType,
      net,
      handlerParcentage: split.handlerParcentage,
      hqParcentage: split.hqParcentage,
      elParcentage: split.elParcentage,
      handlerAmount: amounts.handlerAmount,
      hqAmount: amounts.hqAmount,
      elAmount: amounts.elAmount,
      createdAt: now,
    });

    await paymentsCollection.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: PAYMENT_STATUSES.APPROVED,
          vatApplicable,
          vat,
          net,
          approvedBy: actor.uid,
          approvedAt: now,
          rejectionReason: null,
        },
      }
    );

    await writeAudit({
      action: 'PAYMENT_APPROVED',
      actorUid: actor.uid,
      caseId: c._id.toString(),
      paymentId: payment._id.toString(),
      amount: payment.amount,
      vat,
      net,
      handlerId: c.handlerId,
      handlerParcentage: split.handlerParcentage,
      hqParcentage: split.hqParcentage,
      elParcentage: split.elParcentage,
      // true when the handler's stored percentages were unusable and the role
      // defaults were substituted, so the audit trail explains the amounts.
      splitFallback: !!split.fallback,
    });

    return NextResponse.json({
      success: true,
      // Surface the substitution so the admin UI can warn that the stored split
      // was ignored, instead of silently paying the role defaults.
      splitFallback: !!split.fallback,
      appliedSplit: {
        handlerParcentage: split.handlerParcentage,
        hqParcentage: split.hqParcentage,
        elParcentage: split.elParcentage,
      },
      payment: serializePayment(await paymentsCollection.findOne({ _id: payment._id })),
    });
  } catch (error) {
    console.error('Payment review Error:', error);
    return NextResponse.json({ error: 'Failed to review payment.' }, { status: 500 });
  }
}