'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquareWarning, Pencil, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Pagination from '@/components/ui/Pagination';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import {
  FilterChip,
  SearchInput,
  SectionCard,
  matchesQuery,
} from '@/components/dashboard/wallet/WalletUI';
import { COMPLAINT_STATUSES, MESSAGE_MAX, SUBJECT_MAX, isClosed } from '@/lib/complaints';
import { EditedNote, PER_PAGE, STATUS_LABELS, StatusPill, fmtDateTime } from './ComplaintUI';

const INPUT =
  'w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

/**
 * My Complaints.
 *
 * A caseworker files a complaint, reads the administrator's response, and can
 * edit their own words while the complaint is still open. Every edit is stamped
 * ("Edited <date>"), so a changed account can never be mistaken for the original.
 */
export default function MyComplaints() {
  const axiosSecure = useAxiosSecure();

  const [complaints, setComplaints] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [editing, setEditing] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editMessage, setEditMessage] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

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
      toast.error('Failed to load your complaints.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Add a subject and a description.');
      return;
    }
    setBusy(true);
    const toastId = toast.loading('Submitting your complaint…');
    try {
      const res = await axiosSecure.post('/api/complaints', { subject, message });
      if (res.data?.success) {
        toast.success('Complaint submitted.', { id: toastId });
        setSubject('');
        setMessage('');
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to submit the complaint.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to submit the complaint.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (complaint) => {
    setEditSubject(complaint.subject);
    setEditMessage(complaint.message);
    setEditing(complaint);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    const toastId = toast.loading('Saving your changes…');
    try {
      const res = await axiosSecure.patch(`/api/complaints/${editing.id}`, {
        subject: editSubject,
        message: editMessage,
      });
      if (res.data?.success) {
        toast.success('Complaint updated and marked as edited.', { id: toastId });
        setEditing(null);
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

  const filtered = useMemo(
    () =>
      complaints.filter(
        (c) =>
          (!statusFilter || c.status === statusFilter) &&
          matchesQuery(query, [c.subject, c.message, c.status])
      ),
    [complaints, statusFilter, query]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  if (loading) return <PageSkeleton stats={2} charts={0} table />;

  return (
    <div className="space-y-4">
      <SectionCard title="File a complaint" subtitle="Read by the administrators only">
        <div className="space-y-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUBJECT_MAX}
            placeholder="Subject"
            className={INPUT}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={MESSAGE_MAX}
            placeholder="Describe what happened…"
            className={INPUT}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">
              {message.length}/{MESSAGE_MAX}
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !subject.trim() || !message.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {busy ? 'Submitting…' : 'Submit complaint'}
            </button>
          </div>
        </div>
      </SectionCard>

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
          placeholder="Search your complaints…"
        />
      </div>

      <SectionCard title="My complaints" subtitle={`${filtered.length} of ${complaints.length}`}>
        {paginated.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {complaints.length === 0
              ? 'You have not filed any complaints.'
              : 'No complaints match this filter.'}
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {paginated.map((c) => (
                <article
                  key={c.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-800 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <MessageSquareWarning className="h-4 w-4 shrink-0 text-gray-400" />
                        {c.subject}
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                        <span>Filed {fmtDateTime(c.createdAt)}</span>
                        {c.editedAt ? <span>·</span> : null}
                        <EditedNote complaint={c} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={c.status} />
                      {!isClosed(c) ? (
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">
                    {c.message}
                  </p>

                  {c.resolutionNote ? (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Administrator&apos;s response
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
                        {c.resolutionNote}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">
                        Reviewed {fmtDateTime(c.reviewedAt)}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
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

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Edit complaint
                </h3>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Filed {fmtDateTime(editing.createdAt)} ·{' '}
                  {STATUS_LABELS[editing.status] || editing.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                maxLength={SUBJECT_MAX}
                placeholder="Subject"
                className={INPUT}
              />
              <textarea
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                rows={6}
                maxLength={MESSAGE_MAX}
                placeholder="Describe what happened…"
                className={INPUT}
              />
            </div>

            <p className="mt-3 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              Saving marks this complaint as edited and records the date, so the change stays visible to
              the administrator.
            </p>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={busy || !editSubject.trim() || !editMessage.trim()}
                className="rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
