import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { calculateDealVat } from '@/lib/finance';
import { findCase, findHandlerByUid, isAdmin, isValidHandler, serializeCase } from '@/lib/cases';
import { notifyCaseAssigned } from '@/lib/email/notifications';

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const c = await findCase(id);
  if (!c) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
  }

  const admin = await isAdmin(user.uid);
  const isOwner = c.handlerId === user.uid;

  if (!admin && !isOwner) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  return NextResponse.json({ success: true, case: serializeCase(c) });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json();
    const { title, description, client, dealPrice, handlerId, status, isVat, helperName, priority, category } = body;

    const c = await findCase(id);
    if (!c) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }

    const update = { updatedAt: new Date() };

    if (title != null) update.title = title;
    if (description != null) update.description = description;
    if (helperName != null) update.helperName = helperName;
    if (priority != null) update.priority = priority;
    if (category != null) update.category = category;
    if (status != null) update.status = status;

    if (client != null) {
      update.client = {
        name: client.name || c.client?.name || '',
        email: client.email || c.client?.email || '',
        phone: client.phone || c.client?.phone || '',
        address: client.address || c.client?.address || '',
        dob: client.dob || c.client?.dob || '',
        reference: client.reference || c.client?.reference || '',
      };
    }

    let newPrice = c.dealPrice;
    if (dealPrice != null) {
      newPrice = Number(dealPrice);
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        return NextResponse.json({ error: 'Deal price must be a non-negative number.' }, { status: 400 });
      }
      update.dealPrice = newPrice;
    }

    // Recompute VAT/total when price or the isVat flag changes.
    const newIsVat = isVat != null ? !!isVat : !!c.isVat;
    if (isVat != null) update.isVat = newIsVat;
    if (dealPrice != null || isVat != null) {
      const { vatAmount, totalAmount } = calculateDealVat(newPrice, newIsVat);
      update.vatAmount = vatAmount;
      update.totalAmount = totalAmount;
    }

    if (handlerId != null && handlerId !== c.handlerId) {
      const handler = await findHandlerByUid(handlerId);
      if (!isValidHandler(handler)) {
        return NextResponse.json(
          { error: 'Only an approved, active caseworker (or an admin) can be handed a case.' },
          { status: 400 }
        );
      }
      update.handlerId = handlerId;
      update.handlerName = handler.fullName;
      update.handlerType = handler.role;
    }

    const casesCollection = await getCollection(COLLECTIONS.CASES);
    await casesCollection.updateOne({ _id: c._id }, { $set: update });

    // Audit significant changes.
    if (update.dealPrice != null && update.dealPrice !== c.dealPrice) {
      await writeAudit({
        action: 'CASE_PRICE_UPDATED',
        actorUid: actor.uid,
        caseId: c._id.toString(),
        oldPrice: c.dealPrice,
        newPrice: update.dealPrice,
      });
    }
    if (update.handlerId != null && update.handlerId !== c.handlerId) {
      await writeAudit({
        action: 'CASE_HANDLER_UPDATED',
        actorUid: actor.uid,
        caseId: c._id.toString(),
        oldHandlerId: c.handlerId,
        newHandlerId: update.handlerId,
      });

      // Reaching this point means the update above is already written, so the
      // change can be announced: the new handler is told the case is theirs, and
      // the previous handler is told it has left their list.
      await notifyCaseAssigned({
        caseDoc: {
          ...c,
          handlerId: update.handlerId,
          handlerName: update.handlerName,
          status: update.status || c.status,
        },
        previousHandlerUid: c.handlerId,
        actorUid: actor.uid,
      });
    }

    const updated = await findCase(id);
    return NextResponse.json({ success: true, case: serializeCase(updated) });
  } catch (error) {
    console.error('Case PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update case.' }, { status: 500 });
  }
}

/**
 * Delete a case outright. Admin only, and only while nothing financial points
 * at it: a case with payments or profit distributions on record is refused so
 * the earnings trail (and the wallet balances derived from it) can never be
 * orphaned. Void or reject the payments first, or leave the case closed.
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const c = await findCase(id);
    if (!c) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }

    // Payments and distributions reference the case by _id; the review routes
    // audit with the string form, so both shapes are matched when checking.
    const [paymentsCollection, distributionsCollection, casesCollection] = await Promise.all([
      getCollection(COLLECTIONS.PAYMENTS),
      getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS),
      getCollection(COLLECTIONS.CASES),
    ]);

    const caseId = { $in: [c._id, c._id.toString()] };
    const [paymentCount, distributionCount] = await Promise.all([
      paymentsCollection.countDocuments({ caseId }),
      distributionsCollection.countDocuments({ caseId }),
    ]);

    if (paymentCount > 0 || distributionCount > 0) {
      return NextResponse.json(
        {
          error:
            `This case cannot be deleted: it has ${paymentCount} payment${paymentCount === 1 ? '' : 's'} and ` +
            `${distributionCount} profit distribution${distributionCount === 1 ? '' : 's'} on record. ` +
            'Void or reject the payments first so the earnings stay auditable.',
        },
        { status: 409 }
      );
    }

    await casesCollection.deleteOne({ _id: c._id });
    await writeAudit({
      action: 'CASE_DELETED',
      actorUid: actor.uid,
      caseId: c._id.toString(),
      caseNumber: c.caseNumber,
    });

    return NextResponse.json({ success: true, message: 'Case deleted.' });
  } catch (error) {
    console.error('Case DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete case.' }, { status: 500 });
  }
}
