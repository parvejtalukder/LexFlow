import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const filesCollection = await getCollection(COLLECTIONS.FILES);

    const recentUsers = await usersCollection
      .find({})
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray();

    const recentFiles = await filesCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    return NextResponse.json(
      {
        success: true,
        summary: {
          totalUsers: await usersCollection.countDocuments(),
          totalFiles: await filesCollection.countDocuments(),
        },
        recentUsers,
        recentFiles,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('DB Check Error:', error);
    return NextResponse.json(
      { error: 'Failed to query MongoDB collections.' },
      { status: 500 }
    );
  }
}
