import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { COMPLAINT_STATUSES, serializeComplaint } from '@/lib/complaints';

/** Admin review actions and the status each one moves the complaint to. */
const ACTION_TO_STATUS = {
  in_review: COMPLAINT_STATUSES.IN_REVIEW,
  resolve: COMPLAINT_STATUSES.RESOLVED,
  dismiss: COMPLAINT_STATUSES.DISMISSED,
};

/**
 * Admin review of a complaint.
 * Body: { complaintId, action: 'in_review' | 'resolve' | 'dismiss', resolutionNote? }
 *
 * Admins decide the outcome but never rewrite the complaint text — that stays
 * editable only by the person who filed it (see /api/complaints/[id]).
 */
export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { complaintId, action, resolutionNote } = body || {};
    const status = ACTION_TO_STATUS[action];

    if (!complaintId || !status) {
      return NextResponse.json(
        { error: "complaintId and action ('in_review' | 'resolve' | 'dismiss') are required." },
        { status: 400 }
      );
    }

    const collection = await getCollection(COLLECTIONS.COMPLAINTS);

    let complaint;
    try {
      complaint = await collection.findOne({ _id: new ObjectId(complaintId) });
    } catch {
      return NextResponse.json({ error: 'Invalid complaint id.' }, { status: 400 });
    }

    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    const now = new Date();
    const note = String(resolutionNote ?? '').trim() || null;

    await collection.updateOne(
      { _id: complaint._id },
      {
        $set: {
          status,
          reviewedAt: now,
          reviewedBy: actor.uid,
          resolutionNote: note,
          updatedAt: now,
        },
      }
    );

    await writeAudit({
      action: 'COMPLAINT_STATUS_CHANGED',
      actorUid: actor.uid,
      complaintId: complaint._id.toString(),
      subject: complaint.subject,
      status,
      resolutionNote: note,
    });

    return NextResponse.json({
      success: true,
      complaint: serializeComplaint(await collection.findOne({ _id: complaint._id })),
    });
  } catch (error) {
    console.error('Admin Complaints PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to review the complaint.' }, { status: 500 });
  }
}

/**
 * Delete a complaint. Body: { complaintId }
 *
 * The row is removed outright, so the audit entry (subject, submitter, status)
 * is the only remaining trace of it.
 */
export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { complaintId } = body || {};
    if (!complaintId) {
      return NextResponse.json({ error: 'complaintId is required.' }, { status: 400 });
    }

    const collection = await getCollection(COLLECTIONS.COMPLAINTS);

    let complaint;
    try {
      complaint = await collection.findOne({ _id: new ObjectId(complaintId) });
    } catch {
      return NextResponse.json({ error: 'Invalid complaint id.' }, { status: 400 });
    }

    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    await collection.deleteOne({ _id: complaint._id });

    await writeAudit({
      action: 'COMPLAINT_DELETED',
      actorUid: actor.uid,
      complaintId: complaint._id.toString(),
      subject: complaint.subject,
      submittedBy: complaint.submittedBy,
      status: complaint.status,
    });

    return NextResponse.json({ success: true, message: 'Complaint deleted.' });
  } catch (error) {
    console.error('Admin Complaints DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete the complaint.' }, { status: 500 });
  }
}
