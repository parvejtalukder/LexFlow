'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { Plus, Search, Briefcase, Check, X, Upload, FileText, Eye, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import Spinner from '@/components/ui/Spinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import MediaLibrary from '@/components/media/MediaLibrary';

const PER_PAGE = 10;
const STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CATEGORIES = [
  'Family Law',
  'Immigration',
  'Criminal Defence',
  'Conveyancing',
  'Employment',
  'Civil Litigation',
  'Wills & Probate',
  'Other',
];

/** Human-readable size for the attachment list. */
const fmtSize = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const priorityTone = {
  LOW: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  HIGH: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  URGENT: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
};

function PriorityBadge({ priority }) {
  if (!priority) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        priorityTone[priority] || priorityTone.MEDIUM
      }`}
    >
      {priority}
    </span>
  );
}

const statusTone = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  OPEN: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  CLOSED: 'bg-gray-100 text-gray-600 border-gray-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
};

function StatusBadge({ status }) {
  const tone = statusTone[status] || statusTone.CLOSED;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {status}
    </span>
  );
}

const emptyForm = {
  title: '',
  description: '',
  category: '',
  priority: 'MEDIUM',
  helperName: '',
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  clientDob: '',
  clientReference: '',
  dealPrice: '',
  isVat: false,
  handlerId: '',
  status: 'OPEN',
};

export default function Cases() {
  const axiosSecure = useAxiosSecure();
  const { role } = useAuth();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [cases, setCases] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [attachments, setAttachments] = useState([]);
  const [libOpen, setLibOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null); // { case, action }
  const [rejectReason, setRejectReason] = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const casesRes = await axiosSecure.get('/api/cases');
      if (casesRes.data?.success) setCases(casesRes.data.cases || []);
      if (isAdmin) {
        const handlersRes = await axiosSecure.get('/api/admin/handlers');
        if (handlersRes.data?.success) setHandlers(handlersRes.data.handlers || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load cases.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, isAdmin]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? cases.filter(
        (c) =>
          (c.caseNumber || '').toLowerCase().includes(q) ||
          (c.title || '').toLowerCase().includes(q) ||
          (c.client?.name || '').toLowerCase().includes(q) ||
          (c.handlerName || '').toLowerCase().includes(q)
      )
    : cases;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // ---- case documents ------------------------------------------------------
  // A case cannot be created without at least one document, so uploads are
  // attached to the form first and handed to the API as `fileIds`.
  const addAttachment = (file) => {
    if (!file?.id) return;
    setAttachments((prev) => (prev.some((a) => a.id === file.id) ? prev : [...prev, file]));
  };

  const openCreate = () => {
    setForm(emptyForm);
    setAttachments([]);
    setShowCreate(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    // Attachments are media-library files. Detaching is all that is needed —
    // they stay in the library, where they can be reused or deleted.
    setAttachments([]);
  };

  const removeAttachment = (file) => {
    setAttachments((prev) => prev.filter((a) => a.id !== file.id));
  };

  /** Media-library files are served behind auth, so open them as a blob. */
  const openAttachment = async (doc) => {
    if (!doc?.url) return;
    try {
      const res = await axiosSecure.get(doc.url, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(res.data);
      window.open(objectUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to open document.');
    }
  };

  const createCase = async () => {
    if (!form.title || !form.clientName || !form.dealPrice) {
      toast.error('Title, client name and deal price are required.');
      return;
    }
    if (isAdmin && !form.handlerId) {
      toast.error('Please select a handler.');
      return;
    }
    const price = Number(form.dealPrice);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Deal price must be a non-negative number.');
      return;
    }
    if (attachments.length === 0) {
      toast.error('At least one case document is required.');
      return;
    }

    setBusy(true);
    const toastId = toast.loading('Creating case…');
    try {
      const res = await axiosSecure.post('/api/cases', {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        helperName: form.helperName,
        client: {
          name: form.clientName,
          email: form.clientEmail,
          phone: form.clientPhone,
          address: form.clientAddress,
          dob: form.clientDob,
          reference: form.clientReference,
        },
        dealPrice: price,
        isVat: form.isVat,
        handlerId: isAdmin ? form.handlerId : undefined,
        status: form.status,
        fileIds: attachments.map((a) => a.id),
      });
      if (res.data?.success) {
        const msg = res.data.pendingApproval
          ? 'Case submitted and is pending admin approval.'
          : 'Case created successfully.';
        toast.success(msg, { id: toastId });
        setShowCreate(false);
        setForm(emptyForm);
        setAttachments([]);
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to create case.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create case.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const reviewCase = async () => {
    if (!reviewTarget) return;
    setBusy(true);
    const toastId = toast.loading(reviewTarget.action === 'approve' ? 'Approving case…' : 'Rejecting case…');
    try {
      const res = await axiosSecure.post(`/api/cases/${reviewTarget.case.id}/review`, {
        action: reviewTarget.action,
        rejectionReason: reviewTarget.action === 'reject' ? rejectReason : undefined,
      });
      if (res.data?.success) {
        toast.success(
          reviewTarget.action === 'approve' ? 'Case approved successfully.' : 'Case rejected.',
          { id: toastId }
        );
        setReviewTarget(null);
        setRejectReason('');
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to review case.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to review case.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Delete a case. The API refuses (409) while payments or profit
   * distributions reference it, and its message explains why — so the error is
   * surfaced verbatim instead of a generic failure.
   */
  const deleteCase = async () => {
    if (!deleting) return;
    setBusy(true);
    const toastId = toast.loading('Deleting case…');
    try {
      const res = await axiosSecure.delete(`/api/cases/${deleting.id}`);
      if (res.data?.success) {
        toast.success(res.data.message || 'Case deleted.', { id: toastId });
        setDeleting(null);
        await load();
      } else {
        toast.error(res.data?.error || 'Failed to delete case.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete case.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  // Live VAT preview for the create form.
  const dealBase = Number(form.dealPrice) || 0;
  const dealVat = form.isVat ? Math.round(dealBase * 0.2 * 100) / 100 : 0;
  const dealTotal = Math.round((dealBase + dealVat) * 100) / 100;
  const fmt = (v) => `£${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} case{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search case, client, handler…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#080B1A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" /> New Case
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Cases table, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                <th className="px-4 py-3 font-semibold">Case</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Handler</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                {isAdmin && <th className="px-4 py-3 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={isAdmin ? 7 : 6} rows={8} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-4 py-12 text-center text-gray-500">
                    <Briefcase className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No cases found.
                  </td>
                </tr>
              ) : (
                paginated.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 dark:border-gray-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{c.title}</p>
                      <p className="text-[11px] font-mono text-gray-400">{c.caseNumber}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {c.category && (
                          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{c.category}</span>
                        )}
                        <PriorityBadge priority={c.priority} />
                        {c.documentCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-gray-400"
                            title={`${c.documentCount} document${c.documentCount === 1 ? '' : 's'} attached`}
                          >
                            <FileText className="h-3 w-3" /> {c.documentCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {c.client?.name || '—'}
                      {c.client?.reference && (
                        <p className="text-[10px] text-gray-400">Ref: {c.client.reference}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      £{c.totalAmount != null ? c.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      {c.isVat && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">+VAT</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {c.handlerName || '—'}
                      <p className="text-[10px] text-gray-400 capitalize">{c.handlerType}</p>
                      {c.helperName && (
                        <p className="text-[10px] text-gray-400">Helper: {c.helperName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/dashboard/cases/${c.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Link>
                          <Link
                            href={`/dashboard/cases/${c.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                          {c.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setReviewTarget({ case: c, action: 'approve' })}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => { setReviewTarget({ case: c, action: 'reject' }); setRejectReason(''); }}
                                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleting(c)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>


      <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete Case"
        message={`Delete ${deleting?.caseNumber || 'this case'}? A case with payments or earnings on record cannot be deleted — void or reject those payments first.`}
        confirmLabel="Delete"
        danger
        loading={busy}
        onConfirm={deleteCase}
        onClose={() => setDeleting(null)}
      />

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCreate} />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New Case</h2>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">Case Reason</label>
            <input value={form.title} onChange={set('title')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Subject / reason of the case" />

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Category</label>
                <select value={form.category} onChange={set('category')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select…</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Priority</label>
                <select value={form.priority} onChange={set('priority')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-3 mb-1">Helper Name</label>
            <input value={form.helperName} onChange={set('helperName')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional supporting caseworker" />

            <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Client Name *</label>
                <input value={form.clientName} onChange={set('clientName')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Client Email</label>
                <input value={form.clientEmail} onChange={set('clientEmail')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Client Phone</label>
                <input value={form.clientPhone} onChange={set('clientPhone')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Client Address</label>
                <input value={form.clientAddress} onChange={set('clientAddress')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 mt-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Client Date of Birth</label>
                <input type="date" value={form.clientDob} onChange={set('clientDob')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Client Reference</label>
                <input value={form.clientReference} onChange={set('clientReference')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. File / matter reference" />
              </div>
            </div>

            <div className={`grid gap-3 mt-3 ${isAdmin ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Deal Price (£) *</label>
                <input type="number" min="0" step="0.01" value={form.dealPrice} onChange={set('dealPrice')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Handler *</label>
                  <select value={form.handlerId} onChange={set('handlerId')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select…</option>
                    {handlers.map((h) => (
                      <option key={h.uid} value={h.uid}>
                        {h.fullName} ({h.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Status</label>
                  <select value={form.status} onChange={set('status')} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              {!isAdmin && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Your case will be submitted as the handler and will require admin approval.
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 mt-4 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.isVat}
                onChange={(e) => setForm((prev) => ({ ...prev, isVat: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              isVat — add 20% VAT to the deal price
            </label>

            {dealBase > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600 dark:text-gray-300">
                  <span>Deal Price (net)</span>
                  <span className="font-medium">{fmt(dealBase)}</span>
                </div>
                {form.isVat && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>VAT (20%)</span>
                    <span className="font-medium">{fmt(dealVat)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100 border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                  <span>Total to collect</span>
                  <span>{fmt(dealTotal)}</span>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  Case Documents *
                </label>
                <span className="text-[11px] font-medium text-gray-400">
                  {attachments.length} attached
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* The media library is the only upload path. It carries its own
                    "Upload New" action, so a raw file input is never needed. */}
                <button
                  type="button"
                  onClick={() => setLibOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload / Choose Files
                </button>
              </div>

              <p className="mt-2 text-[11px] text-gray-400">
                Documents come from the media library, where you can upload a new file or reuse
                one you already have. At least one is required to open a case. JPG, PNG, WebP,
                PDF, DOC or DOCX (max 1 MB for images, 3 MB for documents).
              </p>

              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-200">
                          {a.fileName}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400">{fmtSize(a.sizeBytes)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a)}
                        className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-600 dark:hover:bg-gray-800"
                        aria-label={`Remove ${a.fileName}`}
                        title="Remove document"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button type="button" onClick={closeCreate} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button type="button" onClick={createCase} disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50">
                {busy ? (
                  <>
                    <Spinner size={14} className="mr-2" />
                    Creating…
                  </>
                ) : (
                  'Create Case'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReviewTarget(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {reviewTarget.action === 'approve' ? 'Approve Case' : 'Reject Case'}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {reviewTarget.case.title} <span className="font-mono text-gray-400">({reviewTarget.case.caseNumber})</span>
            </p>

            {(reviewTarget.case.documents || []).length > 0 && (
              <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Case Documents ({reviewTarget.case.documents.length})
                </p>
                <ul className="mt-1 space-y-1">
                  {reviewTarget.case.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="truncate text-[11px] text-gray-700 dark:text-gray-200">{doc.fileName}</span>
                        <span className="shrink-0 text-[10px] text-gray-400">{fmtSize(doc.sizeBytes)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openAttachment(doc)}
                        className="shrink-0 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {reviewTarget.action === 'reject' && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">Rejection Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Why is this case being rejected?"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}

            {reviewTarget.action === 'approve' && (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                Approving will make this case active and countable for the handler.
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => { setReviewTarget(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={reviewCase}
                disabled={busy}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${
                  reviewTarget.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {busy ? (
                  <>
                    <Spinner size={14} className="mr-2" />
                    Processing…
                  </>
                ) : reviewTarget.action === 'approve' ? (
                  'Approve'
                ) : (
                  'Reject'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaLibrary
        open={libOpen}
        onClose={() => setLibOpen(false)}
        onSelect={(file) => {
          addAttachment(file);
          setLibOpen(false);
          toast.success('Document attached.');
        }}
        accept="image/*,application/pdf,.doc,.docx"
        title="Select Case Documents"
      />
    </div>
  );
}

