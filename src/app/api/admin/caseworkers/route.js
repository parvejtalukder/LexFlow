import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

const CASEWORKER_STATUSES = ['ACTIVE', 'SUSPENDED'];

function serialize(c) {
  return {
    id: c._id.toString(),
    uid: c.uid,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone || null,
    jobTitle: c.jobTitle || null,
    registrationNumber: c.registrationNumber || null,
    role: c.role,
    accountStatus: c.accountStatus,
    practiceId: c.practiceId ? c.practiceId.toString() : null,
    practiceName: c.practiceName || null,
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
    const { uid, action, practiceId } = body;

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

    if (action === 'updatePractice') {
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

      const oldPractice = target.practiceName || null;
      await usersCollection.updateOne(
        { uid },
        { $set: { practiceId: practice._id, practiceName: practice.name, updatedAt: new Date() } }
      );
      await writeAudit({
        action: 'PRACTICE_UPDATED',
        actorUid: actor.uid,
        targetUid: uid,
        oldPractice,
        newPractice: practice.name,
      });

      return NextResponse.json({ success: true, message: 'Practice updated successfully.' });
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
