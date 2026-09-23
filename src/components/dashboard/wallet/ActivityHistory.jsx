'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import Pagination from '@/components/ui/Pagination';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import useTransactions, { useStatementDownload } from '@/hooks/useTransactions';
import useAuth from '@/hooks/useAuth';
import { accountLabelOf, signedAmount, typeLabel } from '@/lib/statementExport';
import { humanizeStatus } from '@/components/charts/chartTheme';
import {
  FilterChip,
  SearchInput,
  SectionCard,
  StatCard,
  StatusBadge,
  accountBadge,
  fmtDate,
  money,
} from './WalletUI';

const PER_PAGE = 20;

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

const STATUS_FILTERS = ['', 'EARNED', 'PENDING', 'APPROVED', 'PAID', 'REJECTED', 'VOIDED'];

const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'EARNED', label: 'Earnings' },
  { value: 'WITHDRAWAL', label: 'Withdrawals' },
];

// Branch payouts and gross client payments are firm-level rows: they only exist
// in an admin's firm-wide history.
const FIRM_TYPE_FILTERS = [
  ...TYPE_FILTERS,
  { value: 'PAYOUT', label: 'Branch payouts' },
  { value: 'PAYMENT', label: 'Client payments' },
];

/** The same 12-month default window the API applies, so the inputs match the data. */
function defaultRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
  return { from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

/** EARNED is a state rather than a workflow status, so it gets its own tone. */
function TxBadge({ status }) {
  if (status === 'EARNED') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        Earned
      </span>
    );
  }
  return <StatusBadge status={status} />;
}

/**
 * Sign and tone by money direction. Only settled movements get a sign: a
 * PENDING or REJECTED request has not moved anything, so it shows the amount
 * unsigned and muted rather than looking like income.
 */
const TX_SIGN = { in: '+', recorded: '+', out: '−', neutral: '' };
const TX_TONE = {
  in: 'text-emerald-600 dark:text-emerald-400',
  recorded: 'text-emerald-600 dark:text-emerald-400',
  out: 'text-orange-600 dark:text-orange-400',
  neutral: 'text-gray-500 dark:text-gray-400',
};

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2 last:border-0 dark:border-gray-800">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right text-xs font-semibold text-gray-900 dark:text-gray-100">
        {value == null || value === '' ? '—' : value}
      </span>
    </div>
  );
}

/**
 * Transaction History.
 *
 * Every row is a stored record: an approved distribution (earnings), a
 * withdrawal or branch payout, or a client payment. The split percentage and
 * the amounts shown are the ones frozen onto the transaction when it was
 * approved - never re-derived from the caseworker's current configuration, so a
 * later split change affects future transactions only.
 *
 * Filtering, sorting and paging are performed by /api/wallet/transactions.
 */
export default function ActivityHistory() {
  const initial = useMemo(() => defaultRange(), []);
  const { role } = useAuth();

  const [scope, setScope] = useState('personal');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [account, setAccount] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [statementOpen, setStatementOpen] = useState(false);

  // Deep links from the wallet page: ?scope=personal|firm and ?statement=1 to
  // open the statement dialog straight away. Read from location rather than
  // useSearchParams so the page needs no Suspense boundary.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('scope');
    const adminRole = String(role || '').toLowerCase() === 'admin';
    const wantsStatement = params.get('statement') === '1';

    // Applied on a tick rather than synchronously in the effect body, matching
    // the pattern the wallet hook already uses: the effect reads the URL and
    // hands the result to React.
    const id = setTimeout(() => {
      if (requested === 'personal' || (requested === 'firm' && adminRole)) {
        setScope(requested);
      } else if (adminRole) {
        // With no scope in the URL an admin gets the firm-wide history: it is
        // the view they need, and their own personal wallet is usually empty.
        // The wallet page deep-links ?scope=personal to reach the other one.
        setScope('firm');
      }
      if (wantsStatement) setStatementOpen(true);
    }, 0);

    return () => clearTimeout(id);
  }, [role]);

  // Debounced search so typing does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ from, to, type, status, account, q }),
    [from, to, type, status, account, q]
  );
  const { data, loading, isAdmin } = useTransactions({ scope, filters, page, pageSize: PER_PAGE });
  const { download, busy } = useStatementDownload();

  const rows = data?.transactions || [];
  const totals = data?.totals || {};
  const firmScope = data?.scope === 'firm';
  const typeOptions = firmScope ? FIRM_TYPE_FILTERS : TYPE_FILTERS;

  const changeScope = (next) => {
    setScope(next);
    setType('');
    // The ledger filter only exists in firm scope, so it must not linger when
    // the admin switches back to their own history.
    setAccount('');
    setPage(1);
  };

  /** Back to the default window with every filter cleared. */
  const resetFilters = () => {
    const range = defaultRange();
    setFrom(range.from);
    setTo(range.to);
    setType('');
    setStatus('');
    setAccount('');
    setSearchInput('');
    setQ('');
    setPage(1);
  };

  if (loading && !data) return <PageSkeleton stats={4} charts={0} table />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* The page heading comes from DashboardShell (SECTION_INFO), so this row
            carries only the explanatory note plus the action. */}
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Amounts and split rates are the values recorded when each transaction was approved.
        </p>
        <button
          type="button"
          onClick={() => setStatementOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Download className="h-4 w-4" /> Download Statement
        </button>
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={scope === 'personal'} onClick={() => changeScope('personal')} label="My personal" />
          <FilterChip active={scope === 'firm'} onClick={() => changeScope('firm')} label="Firm-wide" />
        </div>
      ) : null}

      <SectionCard
        title="Filters"
        subtitle={
          data
            ? `${totals.count ?? 0} transaction${(totals.count ?? 0) === 1 ? '' : 's'} in range`
            : null
        }
      >
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
            firmScope ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
          }`}
        >
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              From
            </span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              To
            </span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Type
            </span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLASS}
            >
              {typeOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={INPUT_CLASS}
            >
              {STATUS_FILTERS.map((value) => (
                <option key={value || 'all'} value={value}>
                  {value ? humanizeStatus(value) : 'All statuses'}
                </option>
              ))}
            </select>
          </label>
          {firmScope ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Ledger
              </span>
              <select
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setPage(1);
                }}
                className={INPUT_CLASS}
              >
                <option value="">All ledgers</option>
                <option value="HANDLER">Caseworker</option>
                <option value="HQ">Head Office</option>
                <option value="EL">East London</option>
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search case, reference, handler…"
            className="sm:w-80"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="self-start text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            Reset filters
          </button>
        </div>

        {data?.capped ? (
          <p className="mt-3 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            This range holds more rows than can be listed at once — narrow the dates to see everything.
          </p>
        ) : null}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Earned" value={totals.earned} tone="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Reserved" value={totals.reserved} tone="text-amber-600 dark:text-amber-400" />
        <StatCard label="Paid Out" value={totals.paidOut} tone="text-orange-600 dark:text-orange-400" />
        {firmScope ? (
          <StatCard
            label="Client Payments (gross)"
            value={totals.paymentGross}
            subtitle={`VAT recorded ${money(totals.paymentVat)}`}
          />
        ) : (
          <StatCard label="Transactions" value={totals.count ?? 0} plain />
        )}
      </div>

      <SectionCard
        title="Transactions"
        subtitle={data && data.total ? `Page ${data.page} of ${data.totalPages}` : null}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading…' : 'No transactions in this range.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="py-2 pr-4 font-semibold">Date</th>
                    <th className="py-2 pr-4 font-semibold">Description</th>
                    <th className="py-2 pr-4 font-semibold">Type</th>
                    {firmScope ? <th className="py-2 pr-4 font-semibold">Ledger</th> : null}
                    <th className="py-2 pr-4 text-right font-semibold">Amount</th>
                    {firmScope ? <th className="py-2 pr-4 text-right font-semibold">VAT</th> : null}
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const signed = signedAmount(row);
                    // An earning always credits a handler wallet, whether or not
                    // the row carries an explicit account field.
                    const ledger = row.type === 'EARNED' ? 'HANDLER' : row.account;
                    return (
                      <tr
                        key={`${row.type}-${row.id}`}
                        onClick={() => setDetail(row)}
                        className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
                      >
                        <td className="whitespace-nowrap py-3 pr-4 text-xs text-gray-500 dark:text-gray-400">
                          {fmtDate(row.date)}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {row.label || row.description || typeLabel(row.type)}
                          </p>
                          {row.handlerName || row.caseworkerName ? (
                            <p className="text-[11px] text-gray-400">
                              {row.handlerName || row.caseworkerName}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-600 dark:text-gray-300">
                          {typeLabel(row.type)}
                        </td>
                        {firmScope ? (
                          <td className="py-3 pr-4">
                            {row.type === 'PAYMENT' ? (
                              // A gross client payment belongs to no payout ledger.
                              <span className="text-[11px] text-gray-400">—</span>
                            ) : (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  accountBadge[ledger] || accountBadge.HANDLER
                                }`}
                              >
                                {accountLabelOf(ledger)}
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td
                          className={`whitespace-nowrap py-3 pr-4 text-right font-semibold ${
                            TX_TONE[row.direction] || 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {TX_SIGN[row.direction] || ''}
                          {money(Math.abs(signed))}
                        </td>
                        {firmScope ? (
                          <td className="whitespace-nowrap py-3 pr-4 text-right text-xs text-gray-600 dark:text-gray-300">
                            {row.vat == null ? '—' : money(row.vat)}
                          </td>
                        ) : null}
                        <td className="py-3">
                          <TxBadge status={row.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              totalItems={data.total}
              perPage={PER_PAGE}
              onChange={setPage}
            />
          </>
        )}
      </SectionCard>

      {statementOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Download Statement</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {new Date(from).toLocaleDateString()} – {new Date(to).toLocaleDateString()} ·{' '}
                  {firmScope ? 'Firm-wide' : 'My personal transactions'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatementOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
              The statement uses the filters above (dates, type, status, search) and shows exactly the
              transactions listed here, including the split rates recorded with each one.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => download('pdf', { scope, from, to, filters })}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {busy === 'pdf' ? 'Preparing…' : 'Download PDF'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => download('csv', { scope, from, to, filters })}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {busy === 'csv' ? 'Preparing…' : 'Download CSV'}
              </button>
            </div>

            <p className="mt-3 text-[10px] text-gray-400">
              CSV opens in Excel and Google Sheets. PDF is a printable statement for your records.
            </p>
          </div>
        </div>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {detail.label || detail.description || typeLabel(detail.type)}
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {fmtDate(detail.date)} · {typeLabel(detail.type)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TxBadge status={detail.status} />
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  accountBadge[detail.type === 'EARNED' ? 'HANDLER' : detail.account] || accountBadge.HANDLER
                }`}
              >
                {accountLabelOf(detail.type === 'EARNED' ? 'HANDLER' : detail.account)}
              </span>
            </div>

            <p
              className={`mt-4 text-xl font-bold ${
                signedAmount(detail) < 0
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {signedAmount(detail) < 0 ? '−' : '+'}
              {money(Math.abs(signedAmount(detail)))}
            </p>

            <div className="mt-4">
              {detail.caseNumber ? <DetailRow label="Case" value={detail.caseNumber} /> : null}
              {detail.caseTitle ? <DetailRow label="Case title" value={detail.caseTitle} /> : null}
              {detail.clientName ? <DetailRow label="Client" value={detail.clientName} /> : null}
              {detail.handlerName ? <DetailRow label="Handler" value={detail.handlerName} /> : null}
              {detail.caseworkerName && detail.type !== 'EARNED' ? (
                <DetailRow label="Caseworker" value={detail.caseworkerName} />
              ) : null}

              {/* Earnings: the split and amounts frozen onto this distribution
                  when the payment was approved — not today's configuration. */}
              {detail.type === 'EARNED' ? (
                <>
                  <DetailRow label="Net distributed" value={money(detail.net)} />
                  <DetailRow label="Your rate (recorded)" value={`${detail.handlerParcentage}%`} />
                  <DetailRow label="Your amount" value={money(detail.handlerAmount)} />
                  {detail.hqAmount != null ? (
                    <DetailRow
                      label={`Head Office (${detail.hqParcentage}%)`}
                      value={money(detail.hqAmount)}
                    />
                  ) : null}
                  {detail.elAmount != null ? (
                    <DetailRow
                      label={`East London (${detail.elParcentage}%)`}
                      value={money(detail.elAmount)}
                    />
                  ) : null}
                </>
              ) : null}

              {/* Client payments carry the gross and the VAT it contained. */}
              {detail.type === 'PAYMENT' ? (
                <>
                  <DetailRow label="Gross received" value={money(detail.amount)} />
                  <DetailRow label="VAT recorded" value={detail.vat == null ? '—' : money(detail.vat)} />
                  <DetailRow label="Net" value={detail.net == null ? '—' : money(detail.net)} />
                  {detail.termNumber ? <DetailRow label="Term" value={`#${detail.termNumber}`} /> : null}
                  {detail.reference ? <DetailRow label="Reference" value={detail.reference} /> : null}
                  {detail.paymentMethod ? <DetailRow label="Method" value={detail.paymentMethod} /> : null}
                  {detail.description ? <DetailRow label="Note" value={detail.description} /> : null}
                  {detail.approvedAt ? (
                    <DetailRow label="Approved" value={fmtDate(detail.approvedAt)} />
                  ) : null}
                  {detail.rejectionReason ? (
                    <DetailRow label="Rejection reason" value={detail.rejectionReason} />
                  ) : null}
                </>
              ) : null}

              {/* Withdrawals and branch payouts. */}
              {detail.type === 'WITHDRAWAL' || detail.type === 'PAYOUT' ? (
                <>
                  {detail.paymentMethod ? (
                    <DetailRow label="Method" value={detail.paymentMethod} />
                  ) : null}
                  {detail.paymentReference ? (
                    <DetailRow label="Payment reference" value={detail.paymentReference} />
                  ) : null}
                  <DetailRow label="Requested" value={fmtDate(detail.requestedAt)} />
                  {detail.reviewedAt ? (
                    <DetailRow label="Reviewed" value={fmtDate(detail.reviewedAt)} />
                  ) : null}
                  {detail.paidAt ? <DetailRow label="Paid" value={fmtDate(detail.paidAt)} /> : null}
                  {detail.reversedAt ? (
                    <DetailRow label="Reversed" value={fmtDate(detail.reversedAt)} />
                  ) : null}
                  {detail.reversalReason ? (
                    <DetailRow label="Reversal reason" value={detail.reversalReason} />
                  ) : null}
                  {detail.note ? <DetailRow label="Note" value={detail.note} /> : null}
                </>
              ) : null}
            </div>

            <p className="mt-3 text-[10px] text-gray-400">
              Recorded values only — historical splits and amounts are never recalculated.
            </p>
          </div>
        </div>
      ) : null}

    </div>
  );
}
