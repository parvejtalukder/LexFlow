'use client';

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import useWalletData from '@/hooks/useWalletData';
import { PER_PAGE, SearchInput, SectionCard, StatusBadge, fmtDate, matchesQuery, money } from './WalletUI';

/** Income rows are approved payments; everything else is money leaving the wallet. */
const labelOf = (a) => (a.type === 'INCOME' ? 'Payment received' : 'Withdrawal');

/**
 * The wallet's money-in / money-out timeline, split out of the wallet page so
 * the ledger can be searched and paged on its own.
 */
export default function ActivityHistory() {
  const { data, loading } = useWalletData({ failureMessage: 'Failed to load activity.' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  if (loading) return <PageSkeleton stats={0} charts={0} table />;

  const activity = data?.activity || [];

  const filtered = activity.filter((a) =>
    matchesQuery(query, [
      labelOf(a),
      a.caseNumber,
      a.status,
      a.amount,
      a.date ? new Date(a.date).toLocaleString() : '',
    ])
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} of {activity.length} entr{activity.length === 1 ? 'y' : 'ies'}
        </span>
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Search case, type, status…"
        />
      </div>

      <SectionCard title="Activity History" subtitle={`${filtered.length} of ${activity.length}`}>
        {paginated.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {activity.length === 0 ? 'No activity yet.' : 'No activity matches this search.'}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {paginated.map((a) => (
                <div key={`${a.type}-${a.id}`} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {a.type === 'INCOME' ? (
                      <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-orange-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {labelOf(a)}
                        {a.caseNumber ? ` — ${a.caseNumber}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-400">{fmtDate(a.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.status} />
                    <span
                      className={`text-sm font-semibold ${
                        a.type === 'INCOME'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : a.status === 'APPROVED' || a.status === 'PAID'
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {/* Only approved & paid withdrawals actually leave the wallet. */}
                      {a.type === 'INCOME' ? '+' : a.status === 'APPROVED' || a.status === 'PAID' ? '−' : ''}
                      {money(a.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  );
}