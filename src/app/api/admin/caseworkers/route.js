import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

// Statuses that mean "this caseworker has been accepted". Both 'ACTIVE' (set by
// /api/admin/applications) and the legacy 'APPROVED' (set by the older
// /dashboard/application/review endpoint) count, otherwise an accepted
// caseworker can end up listed in no admin view at all.
const CASEWORKER_STATUSES = ['ACTIVE', 'APPROVED', 'SUSPENDED'];

function serialize(c) {
  return {
    id: c._id.toString(),
    uid: c.uid,
    fullName: c.fullName,
    photoURL: c.photoURL || null,
    email: c.email,
    phone: c.phone || null,
    jobTitle: c.jobTitle || null,
    registrationNumber: c.registrationNumber || null,
    role: c.role,
    accountStatus: c.accountStatus,
    practiceId: c.practiceId ? c.practiceId.toString() : null,
    practiceName: c.practiceName || null,
    handlerParcentage: c.handlerParcentage ?? null,
    hqParcentage: c.hqParcentage ?? null,
    elParcentage: c.elParcentage ?? null,
    approvedAt: c.approvedAt || null,
    updatedAt: c.updatedAt,
  };
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const caseworkers = await usersCollection
      .find({ role: 'caseworker', accountStatus: { $in: CASEWORKER_STATUSES } })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      caseworkers: caseworkers.map(serialize),
    });
  } catch (error) {
    console.error('Caseworkers GET Error:', error);
    return NextResponse.json({ error: 'Failed to load caseworkers.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { uid, action, practiceId, jobTitle, handlerParcentage, hqParcentage, elParcentage } = body;

    if (!uid || !action) {
      return NextResponse.json({ error: 'Missing uid or action.' }, { status: 400 });
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json({ error: 'The requested Caseworker was not found.' }, { status: 404 });
    }
    if (target.role !== 'caseworker') {
      return NextResponse.json({ error: 'Target is not a Caseworker.' }, { status: 400 });
    }

    if (action === 'suspend') {
      await usersCollection.updateOne({ uid }, { $set: { accountStatus: 'SUSPENDED', updatedAt: new Date() } });
      await writeAudit({ action: 'CASEWORKER_SUSPENDED', actorUid: actor.uid, targetUid: uid });
      return NextResponse.json({ success: true, message: 'Caseworker suspended successfully.' });
    }

    if (action === 'reactivate') {
      await usersCollection.updateOne({ uid }, { $set: { accountStatus: 'ACTIVE', updatedAt: new Date() } });
      await writeAudit({ action: 'CASEWORKER_REACTIVATED', actorUid: actor.uid, targetUid: uid });
      return NextResponse.json({ success: true, message: 'Caseworker reactivated successfully.' });
    }

    if (action === 'updateDetails') {
      if (!practiceId) {
        return NextResponse.json({ error: 'Please select a Practice.' }, { status: 400 });
      }

      let objectId;
      try {
        objectId = new ObjectId(practiceId);
      } catch {
        return NextResponse.json({ error: 'Invalid Practice.' }, { status: 400 });
      }

      const practicesCollection = await getCollection(COLLECTIONS.PRACTICES);
      const practice = await practicesCollection.findOne({ _id: objectId });
      if (!practice) {
        return NextResponse.json({ error: 'Invalid Practice.' }, { status: 400 });
      }

      const hp = Number(handlerParcentage);
      const hq = Number(hqParcentage);
      const el = Number(elParcentage);
      if (!Number.isFinite(hp) || hp < 0 || hp > 100) {
        return NextResponse.json({ error: 'Handler percentage must be between 0 and 100.' }, { status: 400 });
      }
      if (!Number.isFinite(hq) || hq < 0 || hq > 100) {
        return NextResponse.json({ error: 'HQ percentage must be between 0 and 100.' }, { status: 400 });
      }
      if (!Number.isFinite(el) || el < 0 || el > 100) {
        return NextResponse.json({ error: 'EL percentage must be between 0 and 100.' }, { status: 400 });
      }
      // Must total exactly 100%: resolveSplit() silently falls back to the role
      // defaults for any other total, so a 90% split would be saved but never
      // used, and the caseworker would be paid percentages nobody chose.
      if (Math.abs(hp + hq + el - 100) > 0.001) {
        return NextResponse.json({ error: 'The three percentages must total exactly 100%.' }, { status: 400 });
      }

      await usersCollection.updateOne(
        { uid },
        {
          $set: {
            jobTitle: String(jobTitle || '').trim(),
            practiceId: practice._id,
            practiceName: practice.name,
            handlerParcentage: hp,
            hqParcentage: hq,
            elParcentage: el,
            updatedAt: new Date(),
          },
        }
      );

      await writeAudit({
        action: 'CASEWORKER_DETAILS_UPDATED',
        actorUid: actor.uid,
        targetUid: uid,
        jobTitle: String(jobTitle || '').trim(),
        practiceName: practice.name,
        handlerParcentage: hp,
        hqParcentage: hq,
        elParcentage: el,
      });

      return NextResponse.json({ success: true, message: 'Caseworker updated successfully.' });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('Caseworkers PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update caseworker.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor } = auth;

  try {
    const body = await request.json();
    const { uid } = body;
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid.' }, { status: 400 });
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json({ error: 'The requested Caseworker was not found.' }, { status: 404 });
    }
    if (target.role !== 'caseworker') {
      return NextResponse.json({ error: 'Target is not a Caseworker.' }, { status: 400 });
    }

    // Soft-delete (deactivate) so historical data is never destroyed.
    await usersCollection.updateOne(
      { uid },
      { $set: { accountStatus: 'DEACTIVATED', updatedAt: new Date() } }
    );
    await writeAudit({ action: 'CASEWORKER_DEACTIVATED', actorUid: actor.uid, targetUid: uid });

    return NextResponse.json({ success: true, message: 'Caseworker deactivated successfully.' });
  } catch (error) {
    console.error('Caseworkers DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to deactivate caseworker.' }, { status: 500 });
  }
}
