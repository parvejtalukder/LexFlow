import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { isClosed, isOwner, serializeComplaint, validateComplaintInput } from '@/lib/complaints';

/**
 * Edit a complaint.
 *
 * Owner-only: permission is decided by `submittedBy === user.uid` taken from the
 * verified token, so nobody can edit another person's complaint — and an admin
 * deliberately cannot either, because rewriting someone's account of events
 * would defeat the point of the record.
 *
 * Every successful edit stamps `editedAt` and increments `editCount`; a decided
 * complaint (resolved / dismissed) is refused.
 */
export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const { error, subject, message } = validateComplaintInput(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const collection = await getCollection(COLLECTIONS.COMPLAINTS);

    let complaint;
    try {
      complaint = await collection.findOne({ _id: new ObjectId(id) });
    } catch {
      return NextResponse.json({ error: 'Invalid complaint id.' }, { status: 400 });
    }

    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }
    if (!isOwner(complaint, user.uid)) {
      return NextResponse.json(
        { error: 'Forbidden: you can only edit your own complaint.' },
        { status: 403 }
      );
    }
    if (isClosed(complaint)) {
      return NextResponse.json(
        { error: 'This complaint has already been decided and can no longer be edited.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const editCount = (Number(complaint.editCount) || 0) + 1;

    await collection.updateOne(
      { _id: complaint._id },
      { $set: { subject, message, editedAt: now, editCount, updatedAt: now } }
    );

    await writeAudit({
      action: 'COMPLAINT_EDITED',
      actorUid: user.uid,
      complaintId: complaint._id.toString(),
      subject,
      editCount,
    });

    return NextResponse.json({
      success: true,
      complaint: serializeComplaint(await collection.findOne({ _id: complaint._id })),
    });
  } catch (error) {
    console.error('Complaint PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update the complaint.' }, { status: 500 });
  }
}
