'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import {
  IoCheckmarkCircle,
  IoCloseCircle,
  IoDocumentTextOutline,
  IoTimeOutline,
  IoEyeOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { Search } from 'lucide-react';

const PER_PAGE = 8;

const DEFAULT_SPLITS = {
  caseworker: { handler: 50, hq: 10, el: 40 },
  admin: { handler: 50, hq: 30, el: 20 },
};

export default function AdminApplications() {
  const axiosSecure = useAxiosSecure();
  const [applications, setApplications] = useState([]);
  const [practices, setPractices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [approving, setApproving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [selectedPractice, setSelectedPractice] = useState('');
  const [handler, setHandler] = useState('caseworker');
  const [handlerPct, setHandlerPct] = useState('50');
  const [hqPct, setHqPct] = useState('10');
  const [elPct, setElPct] = useState('40');
  const [rejectionReason, setRejectionReason] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, pRes] = await Promise.all([
        axiosSecure.get('/api/admin/applications'),
        axiosSecure.get('/api/admin/practices'),
      ]);
      if (appsRes.data?.success) setApplications(appsRes.data.applications || []);
      if (pRes.data?.success) setPractices(pRes.data.practices || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load applications.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const viewDoc = async (file) => {
    if (!file?.url) return;
    const toastId = toast.loading('Opening document…');
    try {
      const res = await axiosSecure.get(file.url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      window.open(blobUrl, '_blank');
      toast.dismiss(toastId);
    } catch (err) {
      console.error(err);
      toast.error('Failed to open document.', { id: toastId });
    }
  };

  const openApproval = (app) => {
    setSelectedPractice('');
    setHandler('caseworker');
    setHandlerPct('50');
    setHqPct('10');
    setElPct('40');
    setApproving(app);
  };

  const applySplitDefaults = (type) => {
    const d = DEFAULT_SPLITS[type] || DEFAULT_SPLITS.caseworker;
    setHandlerPct(String(d.handler));
    setHqPct(String(d.hq));
    setElPct(String(d.el));
  };

  const confirmApprove = async () => {
    if (!selectedPractice) {
      toast.error('Please select a Practice before approving this Caseworker.');
      return;
    }
    const hp = Number(handlerPct);
    const hq = Number(hqPct);
    const el = Number(elPct);
    if (!Number.isFinite(hp) || hp < 0 || hp > 100) {
      toast.error('Handler percentage must be between 0 and 100.');
      return;
    }
    if (!Number.isFinite(hq) || hq < 0 || hq > 100) {
      toast.error('HQ percentage must be between 0 and 100.');
      return;
    }
    if (!Number.isFinite(el) || el < 0 || el > 100) {
      toast.error('EL percentage must be between 0 and 100.');
      return;
    }
    setBusy(true);
    const toastId = toast.loading('Approving Caseworker…');
    try {
      const res = await axiosSecure.patch('/api/admin/applications', {
        uid: approving.uid,
        status: 'ACTIVE',
        practiceId: selectedPractice,
        handler,
        handlerParcentage: hp,
        hqParcentage: hq,
        elParcentage: el,
      });
      if (res.data?.success) {
        toast.success('Caseworker application approved successfully.', { id: toastId });
        setApproving(null);
        await load();
      } else {
        toast.error(res.data?.error || 'Unable to approve the application.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Unable to approve the application.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const openReject = (app) => {
    setRejectionReason('');
    setRejecting(app);
  };

  const confirmReject = async () => {
    setBusy(true);
    const toastId = toast.loading('Rejecting…');
    try {
      const res = await axiosSecure.patch('/api/admin/applications', {
        uid: rejecting.uid,
        status: 'REJECTED',
        rejectionReason,
      });
      if (res.data?.success) {
        toast.success('Caseworker rejected successfully.', { id: toastId });
        setRejecting(null);
        await load();
      } else {
        toast.error(res.data?.error || 'Unable to reject the application.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Unable to reject the application.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? applications.filter(
        (a) =>
          (a.fullName || '').toLowerCase().includes(q) ||
          (a.email || '').toLowerCase().includes(q) ||
          (a.uid || '').toLowerCase().includes(q) ||
          (a.id || '').toLowerCase().includes(q)
      )
    : applications;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-gray-100">
            Caseworker Application Requests
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Review credentials and verify submitted identity documents.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3.5 py-1.5 rounded-full text-amber-800 dark:text-amber-300 text-xs font-semibold">
          <IoTimeOutline className="text-base text-amber-600 animate-pulse" />
          <span>{filtered.length} Pending Review</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, user id, request id…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-400 text-xs font-semibold">
          Loading application requests…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-12 text-center text-gray-500">
          <IoShieldCheckmarkOutline className="text-4xl text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            No Pending Applications
          </p>
          <p className="text-xs text-gray-400 mt-1">
            All caseworker requests have been reviewed and processed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginated.map((app) => (
            <div
              key={app.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="grid size-12 place-content-center rounded-full bg-gray-200 dark:bg-gray-700 text-lg font-bold text-gray-600 dark:text-gray-200 uppercase shrink-0">
                    {(app.fullName || '?').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {app.fullName}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {app.email} • {app.phone || 'No phone provided'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      SRA Registration:{' '}
                      <span className="font-mono text-gray-700 dark:text-gray-300">
                        {app.registrationNumber || 'N/A'}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Req ID:{' '}
                      <span className="font-mono text-gray-500 dark:text-gray-400">
                        {app.uid ? app.uid.slice(0, 14) + '…' : '—'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                  {app.documents?.idCard ? (
                    <button
                      type="button"
                      onClick={() => viewDoc(app.documents.idCard)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
                    >
                      <IoDocumentTextOutline className="text-blue-500 text-base" />
                      <span>Govt ID</span>
                      <IoEyeOutline className="text-gray-400 text-xs" />
                    </button>
                  ) : (
                    <span className="text-[11px] text-red-500 font-medium">Missing ID</span>
                  )}

                  {app.documents?.licenseDoc ? (
                    <button
                      type="button"
                      onClick={() => viewDoc(app.documents.licenseDoc)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
                    >
                      <IoDocumentTextOutline className="text-purple-500 text-base" />
                      <span>Practice License</span>
                      <IoEyeOutline className="text-gray-400 text-xs" />
                    </button>
                  ) : (
                    <span className="text-[11px] text-red-500 font-medium">
                      Missing License
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t lg:border-t-0 pt-4 lg:pt-0">
                  <button
                    type="button"
                    onClick={() => openApproval(app)}
                    className="flex-1 lg:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <IoCheckmarkCircle className="text-base" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => openReject(app)}
                    className="flex-1 lg:flex-none px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <IoCloseCircle className="text-base" /> Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      {/* Approval dialog */}
      {approving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setApproving(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Approve Caseworker
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {approving.fullName} — {approving.email}
            </p>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
              Practice
            </label>
            <select
              value={selectedPractice}
              onChange={(e) => setSelectedPractice(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Practice…</option>
              {practices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
              Handler (determines base split)
            </label>
            <select
              value={handler}
              onChange={(e) => {
                setHandler(e.target.value);
                applySplitDefaults(e.target.value);
              }}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="caseworker">Caseworker (50% / 10% / 40%)</option>
              <option value="admin">Admin (50% / 30% / 20%)</option>
            </select>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
                  Handler %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={handlerPct}
                  onChange={(e) => setHandlerPct(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
                  HQ %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={hqPct}
                  onChange={(e) => setHqPct(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
                  EL %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={elPct}
                  onChange={(e) => setElPct(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setApproving(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmApprove}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Approving…' : 'Approve Caseworker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      <ConfirmDialog
        open={!!rejecting}
        title="Reject Caseworker Application"
        message={`Reject ${rejecting?.fullName}? This application can be resubmitted later.`}
        confirmLabel="Reject"
        danger
        loading={busy}
        onConfirm={confirmReject}
        onClose={() => setRejecting(null)}
      >
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
          Reason (optional)
        </label>
        <textarea
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          rows={3}
          placeholder="Reason for rejection…"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </ConfirmDialog>
    </div>
  );
}

