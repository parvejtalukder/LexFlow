import { ObjectId } from 'mongodb';
import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

const MEDIA_URL_PREFIX = '/api/media/';

function fileIdFromUrl(url) {
  if (typeof url === 'string' && url.startsWith(MEDIA_URL_PREFIX)) {
    return url.slice(MEDIA_URL_PREFIX.length).split('?')[0];
  }
  return null;
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request);
    if (auth.error) return auth.error;
    const { user: caller } = auth;

    const body = await request.json();
    const {
      uid,
      fullName,
      phone,
      address,
      jobTitle,
      registrationNumber,
      photoURL,
      photoFileId,
      idCardUrl,
      licenseDocUrl,
      idCardFileId,
      licenseDocFileId,
    } = body;

    if (!uid) {
      return NextResponse.json(
        { error: 'Missing user identifier (uid).' },
        { status: 400 }
      );
    }

    // A user can only submit their own application.
    if (uid !== caller.uid) {
      return NextResponse.json(
        { error: 'You can only submit your own application.' },
        { status: 403 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const filesCollection = await getCollection(COLLECTIONS.FILES);

    // Admins already have full access and must never be demoted to "applicant".
    const existing = await usersCollection.findOne({ uid });
    if (!existing) {
      return NextResponse.json(
        { error: 'User record not found in MongoDB.' },
        { status: 404 }
      );
    }
    if (existing.role === 'admin') {
      return NextResponse.json(
        { error: 'Admins already have full access and cannot apply as a caseworker.' },
        { status: 403 }
      );
    }

    // A media-library file takes precedence for the profile photo.
    const resolvedPhotoUrl = photoFileId
      ? `/api/media/${photoFileId}`
      : photoURL || null;

    const userUpdateResult = await usersCollection.updateOne(
      { uid },
      {
        $set: {
          fullName,
          phone,
          address,
          jobTitle,
          registrationNumber,
          photoURL: resolvedPhotoUrl,
          role: 'applicant',
          accountStatus: 'PENDING',
          updatedAt: new Date(),
        },
      }
    );

    if (userUpdateResult.matchedCount === 0) {
      return NextResponse.json(
        { error: 'User record not found in MongoDB.' },
        { status: 404 }
      );
    }

    const userDoc = await usersCollection.findOne({ uid });

    // Mark media-library files as "submitted" (attached to this application)
    // so admins can see them in the review queue and media library.
    const associations = [
      { fileId: photoFileId, category: 'PROFILE_PHOTO' },
      { fileId: idCardFileId || fileIdFromUrl(idCardUrl), category: 'CASEWORKER_ID' },
      { fileId: licenseDocFileId || fileIdFromUrl(licenseDocUrl), category: 'CASEWORKER_LICENSE' },
    ];

    for (const { fileId, category } of associations) {
      if (!fileId) continue;

      let objectId;
      try {
        objectId = new ObjectId(fileId);
      } catch {
        continue;
      }

      // The owning user is the normal case. When the upload was recorded under a
      // different uid the first update silently matches nothing, which used to
      // leave the document un-submitted and therefore unreadable by admins, so
      // fall back to associating purely by file id.
      const owned = await filesCollection.updateOne(
        { _id: objectId, ownerUid: uid },
        {
          $set: {
            associatedType: 'User',
            associatedId: userDoc._id,
            category,
            updatedAt: new Date(),
          },
        }
      );

      if (owned.matchedCount === 0) {
        const fallback = await filesCollection.updateOne(
          { _id: objectId },
          {
            $set: {
              associatedType: 'User',
              associatedId: userDoc._id,
              category,
              updatedAt: new Date(),
            },
          }
        );

        if (fallback.matchedCount === 0) {
          console.warn(
            `Application submit: media file ${fileId} could not be associated with user ${uid}.`
          );
        }
      }
    }

    // Legacy fallback: remote/VPS URLs (not media-library ids) are still
    // recorded as lightweight reference documents.
    const legacyRecords = [];
    if (idCardUrl && !idCardFileId && !fileIdFromUrl(idCardUrl)) {
      legacyRecords.push({
        fileName: idCardUrl.split('/').pop(),
        fileUrl: idCardUrl,
        fileType: 'GOVERNMENT_ID',
        category: 'CASEWORKER_ID',
        associatedType: 'User',
        associatedId: userDoc._id,
        uploadedBy: userDoc._id,
        ownerUid: uid,
        createdAt: new Date(),
      });
    }
    if (licenseDocUrl && !licenseDocFileId && !fileIdFromUrl(licenseDocUrl)) {
      legacyRecords.push({
        fileName: licenseDocUrl.split('/').pop(),
        fileUrl: licenseDocUrl,
        fileType: 'PRACTICE_LICENSE',
        category: 'CASEWORKER_LICENSE',
        associatedType: 'User',
        associatedId: userDoc._id,
        uploadedBy: userDoc._id,
        ownerUid: uid,
        createdAt: new Date(),
      });
    }
    if (legacyRecords.length > 0) {
      await filesCollection.insertMany(legacyRecords);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Caseworker application submitted successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Application Update API Error:', error);
    return NextResponse.json(
      { error: 'Failed to process application update on the server.' },
      { status: 500 }
    );
  }
}
