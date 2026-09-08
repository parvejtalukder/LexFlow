import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const filesCollection = await getCollection(COLLECTIONS.FILES);

    const pendingUsers = await usersCollection
      .find({
        $or: [
          { accountStatus: 'PENDING' },
          { role: 'applicant' }
        ]
      })
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
        ...user,
        documents: {
          idCard: withUrl(userFiles.find((f) => f.category === 'CASEWORKER_ID')),
          licenseDoc: withUrl(userFiles.find((f) => f.category === 'CASEWORKER_LICENSE')),
          allFiles: userFiles.map(withUrl),
        },
      };
    });

    return NextResponse.json({ success: true, applications }, { status: 200 });
  } catch (error) {
    console.error('Fetch Pending Applications Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve pending applications.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { uid, status, role } = body; 

    if (!uid || !status) {
      return NextResponse.json(
        { error: 'Missing target uid or status.' },
        { status: 400 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);

    const updateFields = {
      accountStatus: status,
      updatedAt: new Date(),
    };

    if (status === 'APPROVED') {
      updateFields.role = role || 'caseworker';
    }

    const result = await usersCollection.updateOne(
      { uid },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'Target user record not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Application status updated to ${status}.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update Application Error:', error);
    return NextResponse.json(
      { error: 'Failed to update user application status.' },
      { status: 500 }
    );
  }
}