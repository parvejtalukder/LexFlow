import { COLLECTIONS, getCollection } from "@/lib/collections";
import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');
    const email = searchParams.get('email')?.toLowerCase().trim();

    if (!uid) {
      return NextResponse.json(
        { error: 'Missing UID!' },
        { status: 400 }
      );
    }

    const usersCollection = await getCollection(COLLECTIONS.USERS);

    // Look up by Firebase uid first, then fall back to email so a stale UID
    // (e.g. after an auth-account re-creation) never demotes an existing user.
    let user = await usersCollection.findOne({ uid });
    if (!user && email) {
      user = await usersCollection.findOne({ email });
    }

    // No document in MongoDB yet → treat as a new/unregistered user instead of 404.
    if (!user) {
      return NextResponse.json(
        {
          success: true,
          role: 'user',
          accountStatus: 'UNREGISTERED',
          fullName: null,
          email: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        role: user.role,
        accountStatus: user.accountStatus,
        fullName: user.fullName || null,
        email: user.email || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Fetch Role API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user record on the server.' },
      { status: 500 }
    );
  }
}