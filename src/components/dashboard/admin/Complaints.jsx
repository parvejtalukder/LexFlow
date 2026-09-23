'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, MessageSquareWarning, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import {
  FilterChip,
  SearchInput,
  SectionCard,
  StatCard,
  matchesQuery,
} from '@/components/dashboard/wallet/WalletUI';
import { COMPLAINT_STATUSES, MESSAGE_MAX } from '@/lib/complaints';
import {
  EditedNote,
  PER_PAGE,
  STATUS_LABELS,
  StatusPill,
  fmtDateTime,
} from '@/components/dashboard/complaints/ComplaintUI';

const ACTIONS = [
  { action: 'in_review', label: 'Mark in review', needsNote: false },
  { action: 'resolve', label: 'Resolve', needsNote: true },
  { action: 'dismiss', label: 'Dismiss', needsNote: true },
];

/**
 * Complaints (admin).
 *
 * Every complaint filed by any user, with the review actions and a delete.
 * Admins decide the outcome and can remove a record, but the complaint text is
 * only editable by the person who filed it — the admin side never rewrites it.
 */
export default function AdminComplaints() {
  const axiosSecure = useAxiosSecure();

  const [complaints, setComplaints] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/complaints');
      if (res.data?.success) {
        setComplaints(res.data.complaints || []);
        setCounts(res.data.counts || {});
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load complaints.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const openReview = (complaint, action) => {
    setResolutionNote(complaint.resolutionNote || '');
    setReviewing({ complaint, action });
    setDetail(null);
  };

  const confirmReview = async () => {
    if (!reviewing) return;
    const { complaint, action } = reviewing;
    setBusy(true);
    const toastId = toast.loading('Saving…');
    try {
      const res = await axiosSecure.patch('/api/admin/complaints', {
        complaintId: complaint.id,
        action: action.action,
        resolutionNote,
      });
      if (res.data?.success) {
        toast.success(`Complaint marked ${(STATUS_LABELS[res.data.complaint.status] || '').toLowerCase()}.`, {
          id: toastId,
        });
        setReviewing(null);
        setResolutionNote('');
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to update the complaint.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update the complaint.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const toastId = toast.loading('Deleting…');
    try {
      const res = await axiosSecure.delete('/api/admin/complaints', {
        data: { complaintId: deleting.id },
      });
      if (res.data?.success) {
        toast.success('Complaint deleted.', { id: toastId });
        setDeleting(null);
        setDetail(null);
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to delete the complaint.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete the complaint.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(
    () =>
      complaints.filter(
        (c) =>
          (!statusFilter || c.status === statusFilter) &&
          matchesQuery(query, [c.subject, c.message, c.submittedByName, c.status])
      ),
    [complaints, statusFilter, query]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  if (loading) return <PageSkeleton stats={4} charts={0} table />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={complaints.length} plain />
        <StatCard
          label="Pending"
          value={counts.PENDING || 0}
          plain
          tone="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="In review"
          value={counts.IN_REVIEW || 0}
          plain
          tone="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Decided"
          value={(counts.RESOLVED || 0) + (counts.DISMISSED || 0)}
          plain
          subtitle={`${counts.RESOLVED || 0} resolved · ${counts.DISMISSED || 0} dismissed`}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={!statusFilter}
            onClick={() => {
              setStatusFilter('');
              setPage(1);
            }}
            label={`All (${complaints.length})`}
          />
          {Object.values(COMPLAINT_STATUSES).map((status) => (
            <FilterChip
              key={status}
              active={statusFilter === status}
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              label={`${STATUS_LABELS[status]} (${counts[status] || 0})`}
            />
          ))}
        </div>
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Search subject, message, submitter…"
        />
      </div>

      <SectionCard title="Complaints" subtitle={`${filtered.length} of ${complaints.length}`}>
        {paginated.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {complaints.length === 0
              ? 'No complaints have been filed.'
              : 'No complaints match this filter.'}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="py-2 pr-4 font-semibold">Subject</th>
                    <th className="py-2 pr-4 font-semibold">Submitted by</th>
                    <th className="py-2 pr-4 font-semibold">Filed</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{c.subject}</p>
                        <EditedNote complaint={c} className="mt-0.5 block" />
                      </td>
                      <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">
                        {c.submittedByName || '—'}
                        {c.submittedByRole ? (
                          <p className="text-[10px] capitalize text-gray-400">{c.submittedByRole}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-xs text-gray-500 dark:text-gray-400">
                        {fmtDateTime(c.createdAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetail(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={safePage}
              totalItems={filtered.length}
              perPage={PER_PAGE}
              onChange={setPage}
            />
          </>
        )}
      </SectionCard>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <MessageSquareWarning className="h-4 w-4 text-gray-400" /> {detail.subject}
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{detail.submittedByName || 'Unknown'}</span>
                  <span>·</span>
                  <span>Filed {fmtDateTime(detail.createdAt)}</span>
                  {detail.editedAt ? <span>·</span> : null}
                  <EditedNote complaint={detail} />
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

            <div className="mt-3">
              <StatusPill status={detail.status} />
            </div>

            <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
              {detail.message}
            </p>

            {detail.resolutionNote ? (
              <div className="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Resolution note
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                  {detail.resolutionNote}
                </p>
                <p className="mt-1 text-[11px] text-gray-400">
                  Reviewed {fmtDateTime(detail.reviewedAt)}
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {ACTIONS.map((action) => (
                <button
                  key={action.action}
                  type="button"
                  onClick={() => openReview(detail, action)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#080B1A] px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDeleting(detail)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        onConfirm={confirmReview}
        title={reviewing?.action?.label || 'Review complaint'}
        message={
          reviewing
            ? `${reviewing.complaint.submittedByName || 'This user'} will see this outcome.`
            : ''
        }
        confirmLabel="Save"
        loading={busy}
      >
        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {reviewing?.action?.needsNote
            ? 'Resolution note (shown to the submitter)'
            : 'Internal note (optional)'}
        </label>
        <textarea
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={4}
          maxLength={MESSAGE_MAX}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this complaint?"
        message={
          deleting
            ? `“${deleting.subject}” will be removed permanently. The audit log keeps a record that it was deleted.`
            : ''
        }
        confirmLabel="Delete"
        danger
        loading={busy}
      />
    </div>
  );
}
