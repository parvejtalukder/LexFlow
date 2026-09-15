import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { findCase, isAdmin } from '@/lib/cases';
import {
  PAYMENT_STATUSES,
  sumCommitted,
  serializePayment,
} from '@/lib/finance';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const paymentsCollection = await getCollection(COLLECTIONS.PAYMENTS);
  const admin = await isAdmin(user.uid);

  const query = admin ? {} : { handlerId: user.uid };
  const payments = await paymentsCollection.find(query).sort({ receivedAt: -1, createdAt: -1 }).toArray();

  return NextResponse.json({
    success: true,
    isAdmin: admin,
    payments: payments.map(serializePayment),
  });
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { caseId, amount, reference, description, paymentMethod, receivedAt } = body;

    if (!caseId || amount == null) {
      return NextResponse.json(
        { error: 'caseId and amount are required.' },
        { status: 400 }
      );
    }

    const R = Number(amount);
    if (!Number.isFinite(R) || R < 0) {
      return NextResponse.json({ error: 'Amount must be a non-negative number.' }, { status: 400 });
    }

    const c = await findCase(caseId);
    if (!c) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }

    if (c.status === 'PENDING' || c.status === 'REJECTED') {
      return NextResponse.json(
        { error: 'Payments can only be submitted for approved (active) cases.' },
        { status: 400 }
      );
    }

    // A caseworker may only submit a payment for their own case. Admins may
    // submit for any case; the payment still enters the approval queue.
    const admin = await isAdmin(actor.uid);
    if (!admin && c.handlerId !== actor.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only submit payments for your own cases.' },
        { status: 403 }
      );
    }

    // The client pays the VAT-inclusive total (dealPrice + 20% VAT when isVat).
    const totalToCollect = c.totalAmount != null ? c.totalAmount : c.dealPrice;

    // Enforce the multi-term rule across APPROVED + PENDING so a term payment
    // never lets the deal exceed what the client owes.
    const paymentsCollection = await getCollection(COLLECTIONS.PAYMENTS);
    const existingPayments = await paymentsCollection.find({ caseId: c._id }).toArray();
    const committed = sumCommitted(existingPayments);
    if (R > totalToCollect - committed + 0.001) {
      return NextResponse.json(
        { error: `This payment exceeds the remaining balance of £${(totalToCollect - committed).toFixed(2)}.` },
        { status: 400 }
      );
    }

    // Term numbers are sequential across non-discarded payments.
    const activeTerms = existingPayments.filter(
      (p) => p.status !== PAYMENT_STATUSES.REJECTED && p.status !== PAYMENT_STATUSES.VOIDED
    );
    const termNumber = activeTerms.length + 1;

    const receivedDate = receivedAt ? new Date(receivedAt) : new Date();
    const now = new Date();

    // No VAT / net / distribution calculation here — that is frozen only when
    // an admin approves, so percentage changes up to that point stay accurate.
    const paymentDoc = {
      caseId: c._id,
      caseNumber: c.caseNumber,
      caseTitle: c.title,
      clientName: c.client?.name || '',
      handlerId: c.handlerId,
      handlerName: c.handlerName,
      handlerType: c.handlerType,
      amount: R,
      termNumber,
      reference: reference || '',
      description: description || '',
      paymentMethod: paymentMethod || '',
      status: PAYMENT_STATUSES.PENDING,
      recordedBy: actor.uid,
      receivedAt: receivedDate,
      createdAt: now,
    };

    const paymentResult = await paymentsCollection.insertOne(paymentDoc);

    await writeAudit({
      action: 'PAYMENT_SUBMITTED',
      actorUid: actor.uid,
      caseId: c._id.toString(),
      paymentId: paymentResult.insertedId.toString(),
      amount: R,
      termNumber,
      reference: reference || '',
      paymentMethod: paymentMethod || '',
      handlerId: c.handlerId,
    });

    return NextResponse.json(
      {
        success: true,
        pendingApproval: true,
        payment: serializePayment({ ...paymentDoc, _id: paymentResult.insertedId }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Payments POST Error:', error);
    return NextResponse.json({ error: 'Failed to submit payment.' }, { status: 500 });
  }
}
