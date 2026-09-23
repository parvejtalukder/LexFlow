import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { isAdmin } from '@/lib/cases';
import { notifyComplaintFiled } from '@/lib/email/notifications';
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_ORDER,
  serializeComplaint,
  validateComplaintInput,
} from '@/lib/complaints';

/**
 * Complaints list.
 *   caseworker -> only the complaints they filed
 *   admin      -> every complaint
 *
 * The whole scoped set is fetched once and the status filter is applied in
 * memory, so the summary counts and the visible rows can never disagree.
 * Optional ?status=PENDING|IN_REVIEW|RESOLVED|DISMISSED.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const admin = await isAdmin(user.uid);
    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get('status') || '').trim().toUpperCase();

    const collection = await getCollection(COLLECTIONS.COMPLAINTS);
    const scoped = await collection
      .find(admin ? {} : { submittedBy: user.uid })
      .sort({ createdAt: -1 })
      .toArray();

    const counts = COMPLAINT_STATUS_ORDER.reduce((acc, value) => {
      acc[value] = scoped.filter((c) => (c.status || COMPLAINT_STATUSES.PENDING) === value).length;
      return acc;
    }, {});

    const complaints = COMPLAINT_STATUS_ORDER.includes(status)
      ? scoped.filter((c) => (c.status || COMPLAINT_STATUSES.PENDING) === status)
      : scoped;

    return NextResponse.json({
      success: true,
      isAdmin: admin,
      total: scoped.length,
      counts,
      complaints: complaints.map(serializeComplaint),
    });
  } catch (error) {
    console.error('Complaints GET Error:', error);
    return NextResponse.json({ error: 'Failed to load complaints.' }, { status: 500 });
  }
}

/** File a new complaint. Body: { subject, message } */
export async function POST(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const body = await request.json();
    const { error, subject, message } = validateComplaintInput(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    // Snapshot the submitter so the record still reads correctly if the account
    // is later renamed or deactivated.
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const actor = await usersCollection.findOne({ uid: user.uid });

    const now = new Date();
    const doc = {
      subject,
      message,
      status: COMPLAINT_STATUSES.PENDING,
      submittedBy: user.uid,
      submittedByName: actor?.fullName || user.displayName || user.email || 'Unknown',
      submittedByRole: actor?.role || null,
      editedAt: null,
      editCount: 0,
      reviewedAt: null,
      reviewedBy: null,
      resolutionNote: null,
      createdAt: now,
      updatedAt: now,
    };

    const collection = await getCollection(COLLECTIONS.COMPLAINTS);
    const result = await collection.insertOne(doc);

    await writeAudit({
      action: 'COMPLAINT_SUBMITTED',
      actorUid: user.uid,
      complaintId: result.insertedId.toString(),
      subject,
    });

    await notifyComplaintFiled({
      complaint: { ...doc, _id: result.insertedId },
      actorUid: user.uid,
    });

    return NextResponse.json(
      { success: true, complaint: serializeComplaint({ ...doc, _id: result.insertedId }) },
      { status: 201 }
    );
  } catch (error) {
    console.error('Complaints POST Error:', error);
    return NextResponse.json({ error: 'Failed to submit the complaint.' }, { status: 500 });
  }
}
