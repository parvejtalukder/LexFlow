import { COLLECTIONS, getCollection } from '@/lib/collections';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isAdmin, findHandlerByUid } from '@/lib/cases';
import { calculateVatAndNet, distribute, round2, serializeDistribution, resolveSplit } from '@/lib/finance';

/**
 * A caseworker's personal earnings = their handler share across all
 * ProfitDistribution records. Admins may also fetch the full ledger.
 */
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  const { user } = auth;

  const admin = await isAdmin(user.uid);
  const distributionsCollection = await getCollection(COLLECTIONS.PROFIT_DISTRIBUTIONS);

  const query = admin ? {} : { handlerId: user.uid };
  const [distributions, userDoc] = await Promise.all([
    distributionsCollection.find(query).sort({ createdAt: -1 }).toArray(),
    findHandlerByUid(user.uid),
  ]);

  // Drives the revenue calculator: the handler's own slice of the net amount.
  const split = resolveSplit(userDoc);

  // Optional "what-if" projection for the revenue calculator. It runs the same
  // chain the approval endpoint uses (calculateVatAndNet -> resolveSplit ->
  // distribute), so the calculator can show the penny-accurate figures the user
  // would actually be paid instead of a client-side approximation that drifts a
  // penny on some amounts. Only totals come back: caseworkers still never learn
  // how the remainder splits between HQ and East London.
  let projection = null;
  const { searchParams } = new URL(request.url);
  const projectParam = searchParams.get('project');
  if (projectParam !== null && projectParam.trim() !== '') {
    const gross = Number(projectParam);
    if (Number.isFinite(gross) && gross >= 0) {
      const vatApplicable = searchParams.get('vat') !== '0';
      const projected = calculateVatAndNet(gross, vatApplicable);
      const amounts = distribute(projected.net, split);
      projection = {
        gross: round2(gross),
        vat: projected.vat,
        net: projected.net,
        vatApplicable,
        handlerShare: amounts.handlerAmount,
        firmShare: round2(amounts.hqAmount + amounts.elAmount),
        handlerPercent: split.handlerParcentage,
      };
    }
  }

  const summary = distributions.reduce(
    (acc, d) => {
      acc.totalNet += d.net || 0;
      acc.totalHandler += d.handlerAmount || 0;
      if (admin) {
        acc.totalHq += d.hqAmount || 0;
        acc.totalEl += d.elAmount || 0;
      }
      return acc;
    },
    { totalNet: 0, totalHandler: 0, totalHq: 0, totalEl: 0 }
  );

  // Privacy: caseworkers never see Head Office / East London amounts.
  const resultSummary = admin
    ? {
        totalNet: round2(summary.totalNet),
        totalHandler: round2(summary.totalHandler),
        totalHq: round2(summary.totalHq),
        totalEl: round2(summary.totalEl),
        handlerPercent: split.handlerParcentage,
        distributionCount: distributions.length,
      }
    : {
        totalNet: round2(summary.totalNet),
        totalHandler: round2(summary.totalHandler),
        handlerPercent: split.handlerParcentage,
        distributionCount: distributions.length,
      };

  return NextResponse.json({
    success: true,
    isAdmin: admin,
    summary: resultSummary,
    // null unless ?project= was supplied; see the projection block above.
    projection,
    distributions: distributions.map((d) => serializeDistribution(d, admin)),
  });
}
