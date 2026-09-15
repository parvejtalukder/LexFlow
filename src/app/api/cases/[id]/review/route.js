import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { CASE_STATUSES, findCase, serializeCase } from '@/lib/cases';

/**
 * Admin review of a caseworker-submitted case.
 * Body: { action: 'approve' | 'reject', rejectionReason? }
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const adminAuth = await requireAdmin(request);
  if (adminAuth.error) return adminAuth.error;
  const { user: actor } = adminAuth;

  try {
    const body = await request.json();
    const { action, rejectionReason } = body;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    const c = await findCase(id);
    if (!c) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }

    if (c.status !== CASE_STATUSES.PENDING) {
      return NextResponse.json(
        { error: 'Only pending cases can be reviewed.' },
        { status: 400 }
      );
    }

    const update =
      action === 'approve'
        ? {
            status: CASE_STATUSES.OPEN,
            approvedAt: new Date(),
            approvedBy: actor.uid,
            rejectionReason: null,
            updatedAt: new Date(),
          }
        : {
            status: CASE_STATUSES.REJECTED,
            rejectionReason: rejectionReason || null,
            updatedAt: new Date(),
          };

    const casesCollection = await getCollection(COLLECTIONS.CASES);
    await casesCollection.updateOne({ _id: c._id }, { $set: update });

    await writeAudit({
      action: action === 'approve' ? 'CASE_APPROVED' : 'CASE_REJECTED',
      actorUid: actor.uid,
      caseId: c._id.toString(),
      rejectionReason: action === 'reject' ? rejectionReason || null : null,
    });

    const updated = await findCase(id);
    return NextResponse.json({ success: true, case: serializeCase(updated) });
  } catch (error) {
    console.error('Case review Error:', error);
    return NextResponse.json({ error: 'Failed to review case.' }, { status: 500 });
  }
}
