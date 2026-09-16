import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { calculateDealVat } from '@/lib/finance';
import {
  isAdmin,
  isValidHandler,
  nextCaseNumber,
  serializeCase,
  findHandlerByUid,
  CASE_STATUSES,
} from '@/lib/cases';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const casesCollection = await getCollection(COLLECTIONS.CASES);
  const admin = await isAdmin(user.uid);

  // Admins see all cases; caseworkers see strictly their own.
  const query = admin ? {} : { handlerId: user.uid };
  const cases = await casesCollection.find(query).sort({ createdAt: -1 }).toArray();

  return NextResponse.json({ success: true, isAdmin: admin, cases: cases.map(serializeCase) });
}

export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { title, description, client, dealPrice, handlerId, status, isVat, helperName, priority, category, fileIds } = body;

    if (!title || !client?.name || dealPrice == null) {
      return NextResponse.json(
        { error: 'title, client.name and dealPrice are required.' },
        { status: 400 }
      );
    }

    const price = Number(dealPrice);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Deal price must be a non-negative number.' }, { status: 400 });
    }

    const admin = await isAdmin(actor.uid);

    // A caseworker may only create a case where they are the handler.
    // Only an admin may assign a case to another handler.
    const effectiveHandlerId = admin ? handlerId : actor.uid;
    if (!effectiveHandlerId) {
      return NextResponse.json({ error: 'A handler must be assigned.' }, { status: 400 });
    }

    // Mirror handler name/type from the actual user record.
    const handler = await findHandlerByUid(effectiveHandlerId);
    if (!isValidHandler(handler)) {
      return NextResponse.json(
        { error: 'Only an approved, active caseworker (or an admin) can be handed a case.' },
        { status: 400 }
      );
    }

    // A case cannot be opened without its paperwork, so at least one uploaded
    // media-library document must be attached at creation time.
    const requestedFileIds = Array.isArray(fileIds) ? fileIds.filter(Boolean) : [];
    if (requestedFileIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one case document must be uploaded.' },
        { status: 400 }
      );
    }

    const fileObjectIds = [];
    for (const rawId of requestedFileIds) {
      try {
        fileObjectIds.push(new ObjectId(rawId));
      } catch {
        return NextResponse.json(
          { error: 'One or more selected documents are invalid. Please upload them again.' },
          { status: 400 }
        );
      }
    }

    const filesCollection = await getCollection(COLLECTIONS.FILES);
    const fileDocs = await filesCollection.find({ _id: { $in: fileObjectIds } }).toArray();

    if (fileDocs.length === 0) {
      return NextResponse.json(
        { error: 'Uploaded documents could not be found. Please upload them again.' },
        { status: 400 }
      );
    }

    // Only the uploader may attach a library file; admins may attach anyone's.
    // A file can be attached to any number of records, so already being in use
    // elsewhere is not a reason to refuse it.
    if (!admin && fileDocs.some((f) => f.ownerUid !== actor.uid)) {
      return NextResponse.json(
        { error: 'Forbidden: you can only attach your own documents.' },
        { status: 403 }
      );
    }

    // isVat → auto-add 20% VAT of the entered (net) deal price.
    const vatFlag = !!isVat;
    const { vatAmount, totalAmount } = calculateDealVat(price, vatFlag);

    const casesCollection = await getCollection(COLLECTIONS.CASES);
    const now = new Date();

    // Caseworker-created cases start PENDING and require admin approval.
    // Admin-created cases are active immediately.
    const isPending = !admin;
    const doc = {
      caseNumber: await nextCaseNumber(),
      title,
      category: category || '',
      priority: priority || null,
      helperName: helperName || '',
      description: description || '',
      client: {
        name: client.name,
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        dob: client.dob || '',
        reference: client.reference || '',
      },
      dealPrice: price,
      isVat: vatFlag,
      vatAmount,
      totalAmount,
      handlerId: effectiveHandlerId,
      handlerName: handler.fullName,
      handlerType: handler.role,
      status: isPending ? CASE_STATUSES.PENDING : status || CASE_STATUSES.OPEN,
      createdBy: actor.uid,
      // Snapshot of the attached documents so listings/reviews do not need a join.
      documents: fileDocs.map((f) => ({
        id: f._id,
        fileName: f.fileName,
        mimeType: f.mimeType || '',
        sizeBytes: f.sizeBytes || 0,
      })),
      ...(isPending ? {} : { approvedAt: now, approvedBy: actor.uid }),
      createdAt: now,
      updatedAt: now,
    };

    const result = await casesCollection.insertOne(doc);

    // Stamp the files so the library knows they are in use (which also blocks
    // deletion of their bytes). Files that already carry an association are left
    // alone: one image may be attached to several records, and overwriting a KYC
    // association would drop that file from the user's application. The case's
    // own `documents` snapshot above records which files belong to this case.
    await filesCollection.updateMany(
      { _id: { $in: fileDocs.map((f) => f._id) }, associatedType: null },
      {
        $set: {
          associatedType: 'Case',
          associatedId: result.insertedId,
          category: 'CASE_DOCUMENT',
          updatedAt: now,
        },
      }
    );

    await writeAudit({
      action: isPending ? 'CASE_SUBMITTED' : 'CASE_CREATED',
      actorUid: actor.uid,
      caseId: result.insertedId.toString(),
      dealPrice: price,
      isVat: vatFlag,
      vatAmount,
      totalAmount,
      documentCount: fileDocs.length,
      handlerId: effectiveHandlerId,
      status: doc.status,
    });

    return NextResponse.json(
      {
        success: true,
        pendingApproval: isPending,
        case: serializeCase({ ...doc, _id: result.insertedId }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Cases POST Error:', error);
    return NextResponse.json({ error: 'Failed to create case.' }, { status: 500 });
  }
}

