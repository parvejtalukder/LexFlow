import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const dbUser = await usersCollection.findOne({ uid: user.uid });

    if (!dbUser) {
      return NextResponse.json({ error: 'User record not found.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: dbUser._id.toString(),
        uid: dbUser.uid,
        fullName: dbUser.fullName,
        email: dbUser.email,
        photoURL: dbUser.photoURL || null,
        phone: dbUser.phone || null,
        address: dbUser.address || null,
        jobTitle: dbUser.jobTitle || null,
        registrationNumber: dbUser.registrationNumber || null,
        staffId: dbUser.staffId || null,
        role: dbUser.role,
        accountStatus: dbUser.accountStatus,
        practiceName: dbUser.practiceName || null,
        handlerParcentage: dbUser.handlerParcentage ?? null,
        hqParcentage: dbUser.hqParcentage ?? null,
        elParcentage: dbUser.elParcentage ?? null,
        joiningDate: dbUser.joiningDate || null,
        approvedAt: dbUser.approvedAt || null,
        createdAt: dbUser.createdAt || null,
        updatedAt: dbUser.updatedAt || null,
      },
    });
  } catch (error) {
    console.error('My Profile API Error:', error);
    return NextResponse.json({ error: 'Failed to load profile.' }, { status: 500 });
  }
}
