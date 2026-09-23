import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isAdmin } from '@/lib/cases';
import { collectTransactions } from '@/lib/transactionQuery';
import { MAX_STATEMENT_ROWS } from '@/lib/transactions';

/**
 * Statement data for a date range.
 *
 * Returns the complete filtered set (not a page) so the client can render both
 * CSV and the PDF statement from one payload, and so both formats are bound by
 * exactly the same permissions as Transaction History: personal scope is the
 * caller's own records, firm scope is admin-only, and only an admin ever
 * receives HQ / East London figures or gross client payments.
 *
 * The rows carry the split percentages and amounts frozen on each distribution
 * when the payment was approved - a later change to a caseworker's split cannot
 * alter a historical statement.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  try {
    const admin = await isAdmin(user.uid);
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    if (String(params.scope || '').toLowerCase() === 'firm' && !admin) {
      return NextResponse.json(
        { error: 'Forbidden: firm-wide statements are admin-only.' },
        { status: 403 }
      );
    }

    const result = await collectTransactions({
      uid: user.uid,
      admin,
      params,
      maxRows: MAX_STATEMENT_ROWS,
    });

    const firmScope = result.scope === 'firm';

    return NextResponse.json({
      success: true,
      isAdmin: admin,
      scope: result.scope,
      range: result.range,
      generatedAt: new Date().toISOString(),
      owner: {
        uid: user.uid,
        name: firmScope
          ? 'Firm-wide'
          : user.displayName || user.email || 'Caseworker',
      },
      capped: result.capped,
      maxRows: MAX_STATEMENT_ROWS,
      totals: result.totals,
      transactions: result.rows,
    });
  } catch (error) {
    console.error('Wallet Statement GET Error:', error);
    return NextResponse.json({ error: 'Failed to build the statement.' }, { status: 500 });
  }
}
