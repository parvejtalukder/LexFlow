import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/cases';
import { collectTransactions } from '@/lib/transactionQuery';
import { clampPage, clampPageSize, paginate, TX_TYPES, ADMIN_TYPES } from '@/lib/transactions';

/**
 * Transaction History.
 *
 * A read-only projection over existing financial records (see
 * src/lib/transactions.js). Personal scope is the caller's own earnings and
 * withdrawals; firm scope additionally exposes branch payouts and gross client
 * payments and is admin-only.
 *
 * Filters (from/to/type/status/account/q) are applied server-side, and the
 * browser receives a single page.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const admin = await isAdmin(user.uid);
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    // parseScope() downgrades an unauthorised `firm` request silently, which
    // would answer 200 with a different dataset. Refuse it explicitly instead.
    if (String(params.scope || '').toLowerCase() === 'firm' && !admin) {
      return NextResponse.json(
        { error: 'Forbidden: firm-wide transaction history is admin-only.' },
        { status: 403 }
      );
    }

    const page = clampPage(params.page);
    const pageSize = clampPageSize(params.pageSize);

    const result = await collectTransactions({ uid: user.uid, admin, params });
    const paged = paginate(result.rows, page, pageSize);

    return NextResponse.json({
      success: true,
      isAdmin: admin,
      scope: result.scope,
      account: result.scope === 'firm' ? null : 'HANDLER',
      range: result.range,
      page: paged.page,
      pageSize,
      total: paged.total,
      totalPages: paged.totalPages,
      // True when the window held more rows than the fetch cap; the UI asks the
      // user to narrow the range rather than pretending the list is complete.
      capped: result.capped,
      totals: result.totals,
      availableTypes: admin && result.scope === 'firm' ? ADMIN_TYPES : [TX_TYPES.EARNED, TX_TYPES.WITHDRAWAL],
      transactions: paged.rows,
    });
  } catch (error) {
    console.error('Wallet Transactions GET Error:', error);
    return NextResponse.json({ error: 'Failed to load transactions.' }, { status: 500 });
  }
}
