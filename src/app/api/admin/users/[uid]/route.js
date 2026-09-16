import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { computeWalletBalance } from '@/lib/wallet';

/**
 * One user record for the admin "View user" page (/dashboard/users/[uid]).
 *
 * Returns the same fields the users list does — so the detail page never shows
 * more about a person than the table already did — plus the counts an admin
 * actually needs before acting on an account: how many cases and payments are
 * attached to it, and where its wallet stands.
 */
export async function GET(request, { params }) {
  const { uid } = await params;
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const usersCollection = await getCollection(COLLECTIONS.USERS);
    const u = await usersCollection.findOne({ uid });
    if (!u) {
      return NextResponse.json(
        { error: 'The requested user was not found.' },
        { status: 404 }
      );
    }

    const [casesCollection, paymentsCollection, distributionsCollection, withdrawalsCollection] =
      await Promise.all([
        getCollection(COLLECTIONS.CASES),
        getCollection(COLLECTIONS.PAYMENTS),
        getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS),
        getCollection(COLLECTIONS.WITHDRAWALS),
      ]);

    const [caseCount, paymentCount, distributions, withdrawals] = await Promise.all([
      casesCollection.countDocuments({ handlerId: uid }),
      paymentsCollection.countDocuments({ handlerId: uid }),
      distributionsCollection.find({ handlerId: uid }).toArray(),
      withdrawalsCollection.find({ caseworkerUid: uid }).toArray(),
    ]);

    return NextResponse.json({
      success: true,
      user: {
        id: u._id.toString(),
        uid: u.uid,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        accountStatus: u.accountStatus,
        phone: u.phone || null,
        jobTitle: u.jobTitle || null,
        registrationNumber: u.registrationNumber || null,
        photoURL: u.photoURL || null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
      stats: {
        caseCount,
        paymentCount,
        distributionCount: distributions.length,
        withdrawalCount: withdrawals.length,
        // Same helpers the wallet uses, so the numbers agree to the penny.
        ...computeWalletBalance(distributions, withdrawals),
      },
    });
  } catch (error) {
    console.error('Admin User GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve the user.' },
      { status: 500 }
    );
  }
}