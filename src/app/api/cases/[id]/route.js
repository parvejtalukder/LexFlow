import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { calculateDealVat } from '@/lib/finance';
import { findCase, findHandlerByUid, isAdmin, isValidHandler, serializeCase } from '@/lib/cases';

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
          { error: 'Assigned handler is not a valid admin or caseworker.' },
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
    }

    const updated = await findCase(id);
    return NextResponse.json({ success: true, case: serializeCase(updated) });
  } catch (error) {
    console.error('Case PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update case.' }, { status: 500 });
  }
}
