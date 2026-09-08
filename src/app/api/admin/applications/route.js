import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import admin from '@/lib/firebaseAdmin';
import { writeAudit } from '@/lib/audit';

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const filesCollection = await getCollection(COLLECTIONS.FILES);

    // Only genuinely PENDING applications. Rejected applicants keep role
    // 'applicant' but have accountStatus 'REJECTED', so they must be excluded.
    const pendingUsers = await usersCollection
      .find({ role: 'applicant', accountStatus: 'PENDING' })
      .sort({ createdAt: -1 })
      .toArray();

    const userIds = pendingUsers.map((u) => u._id);
    const associatedFiles = await filesCollection
      .find({ associatedId: { $in: userIds } })
      .toArray();

    const withUrl = (f) =>
      f ? { ...f, url: `/api/media/${f._id.toString()}` } : null;

    const applications = pendingUsers.map((user) => {
      const userFiles = associatedFiles.filter(
        (f) => f.associatedId.toString() === user._id.toString()
      );
      return {
        id: user._id.toString(),
        uid: user.uid,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone || null,
        address: user.address || null,
        jobTitle: user.jobTitle || null,
        registrationNumber: user.registrationNumber || null,
        photoURL: user.photoURL || null,
        role: user.role,
        accountStatus: user.accountStatus,
        createdAt: user.createdAt,
        documents: {
          idCard: withUrl(userFiles.find((f) => f.category === 'CASEWORKER_ID')),
          licenseDoc: withUrl(userFiles.find((f) => f.category === 'CASEWORKER_LICENSE')),
          profilePhoto: withUrl(userFiles.find((f) => f.category === 'PROFILE_PHOTO')),
        },
      };
    });

    return NextResponse.json({ success: true, applications });
  } catch (error) {
    console.error('Admin Applications API Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve pending applications.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { user: actor, dbUser: adminUser } = auth;

  try {
    const body = await request.json();
    const { uid, status, practiceId, rejectionReason, handler, handlerParcentage, hqParcentage, elParcentage } = body;

    if (!uid || !status) {
      return NextResponse.json(
        { error: 'Missing target uid or status.' },
        { status: 400 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const target = await usersCollection.findOne({ uid });
    if (!target) {
      return NextResponse.json(
        { error: 'The requested Caseworker was not found.' },
        { status: 404 }
      );
    }

    // Only PENDING applications may be approved/rejected.
    const isPending =
      target.accountStatus === 'PENDING' || target.role === 'applicant';
    if ((status === 'ACTIVE' || status === 'REJECTED') && !isPending) {
      return NextResponse.json(
        { error: 'This application is not pending.' },
        { status: 409 }
      );
    }

    const updateFields = { accountStatus: status, updatedAt: new Date() };
    let practice = null;

    if (status === 'ACTIVE') {
      // Practice is mandatory when approving a caseworker.
      if (!practiceId) {
        return NextResponse.json(
          { error: 'Please select a Practice before approving this Caseworker.' },
          { status: 400 }
        );
      }

      let objectId;
      try {
        objectId = new ObjectId(practiceId);
      } catch {
        return NextResponse.json({ error: 'Invalid Practice.' }, { status: 400 });
      }

      const practicesCollection = await getCollection(COLLECTIONS.PRACTICES);
      practice = await practicesCollection.findOne({ _id: objectId });
      if (!practice) {
        return NextResponse.json({ error: 'Invalid Practice.' }, { status: 400 });
      }

      // The assigned handler determines the base profit-sharing split.
      const handlerType = handler === 'admin' ? 'admin' : 'caseworker';
      const hp = Number(handlerParcentage);
      const hq = Number(hqParcentage);
      const el = Number(elParcentage);
      if (!Number.isFinite(hp) || hp < 0 || hp > 100) {
        return NextResponse.json(
          { error: 'Handler percentage must be a number between 0 and 100.' },
          { status: 400 }
        );
      }
      if (!Number.isFinite(hq) || hq < 0 || hq > 100) {
        return NextResponse.json(
          { error: 'HQ percentage must be a number between 0 and 100.' },
          { status: 400 }
        );
      }
      if (!Number.isFinite(el) || el < 0 || el > 100) {
        return NextResponse.json(
          { error: 'EL percentage must be a number between 0 and 100.' },
          { status: 400 }
        );
      }

      updateFields.handler = handlerType;
      updateFields.handlerParcentage = hp;
      updateFields.hqParcentage = hq;
      updateFields.elParcentage = el;
      updateFields.role = 'caseworker';
      updateFields.practiceId = practice._id;
      updateFields.practiceName = practice.name;
      updateFields.approvedAt = new Date();
      updateFields.approvedBy = adminUser._id;
      updateFields.joiningDate = new Date();
    }

    if (status === 'REJECTED') {
      updateFields.rejectionReason = rejectionReason || null;
    }

    const result = await usersCollection.updateOne({ uid }, { $set: updateFields });
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'The requested Caseworker was not found.' },
        { status: 404 }
      );
    }

    // Best-effort Firebase role claim. MongoDB role is the authoritative source
    // of truth for authorization in this app.
    if (status === 'ACTIVE') {
      try {
        await admin.auth().setCustomUserClaims(uid, { role: 'caseworker' });
      } catch (err) {
        console.error('Failed to set Firebase custom claim:', err);
      }
    }

    await writeAudit({
      action: status === 'ACTIVE' ? 'CASEWORKER_APPROVED' : 'CASEWORKER_REJECTED',
      actorUid: actor.uid,
      targetUid: uid,
      practiceId: practice ? practice._id : null,
      practiceName: practice ? practice.name : null,
      handler: status === 'ACTIVE' ? (handler === 'admin' ? 'admin' : 'caseworker') : null,
      handlerParcentage: status === 'ACTIVE' ? Number(handlerParcentage) : null,
      hqParcentage: status === 'ACTIVE' ? Number(hqParcentage) : null,
      elParcentage: status === 'ACTIVE' ? Number(elParcentage) : null,
      rejectionReason: status === 'REJECTED' ? rejectionReason || null : null,
    });

    return NextResponse.json({
      success: true,
      message:
        status === 'ACTIVE'
          ? 'Caseworker application approved successfully.'
          : 'Caseworker application rejected.',
    });
  } catch (error) {
    console.error('Admin Applications PATCH Error:', error);
    return NextResponse.json(
      { error: 'Failed to update application status.' },
      { status: 500 }
    );
  }
}
