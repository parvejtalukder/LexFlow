'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import {
  Search,
  Pencil,
  Ban,
  RotateCcw,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Pagination from '@/components/ui/Pagination';
import Avatar from '@/components/ui/Avatar';

const PER_PAGE = 8;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// Same tolerance the server uses when it validates a 100% revenue split.
const SPLIT_TOLERANCE = 0.001;

const statusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  // Legacy approval status — treated as accepted, normalised to ACTIVE by the
  // "Reactivate" action.
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function Caseworkers() {
  const axiosSecure = useAxiosSecure();
  const [caseworkers, setCaseworkers] = useState([]);
  const [practices, setPractices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(null);
  const [selectedPractice, setSelectedPractice] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editHandlerPct, setEditHandlerPct] = useState('50');
  const [editHqPct, setEditHqPct] = useState('10');
  const [editElPct, setEditElPct] = useState('40');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cwRes, pRes] = await Promise.all([
        axiosSecure.get('/api/admin/caseworkers'),
        axiosSecure.get('/api/admin/practices'),
      ]);
      if (cwRes.data?.success) setCaseworkers(cwRes.data.caseworkers || []);
      if (pRes.data?.success) setPractices(pRes.data.practices || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load caseworkers.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? caseworkers.filter(
        (c) =>
          (c.fullName || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.practiceName || '').toLowerCase().includes(q) ||
          (c.uid || '').toLowerCase().includes(q) ||
          (c.id || '').toLowerCase().includes(q)
      )
    : caseworkers;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const patch = async (uid, action, body = {}) => {
    setBusy(true);
    const toastId = toast.loading('Processing…');
    try {
      const res = await axiosSecure.patch('/api/admin/caseworkers', {
        uid,
        action,
        ...body,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Done.', { id: toastId });
        await load();
        return true;
      }
      toast.error(res.data?.error || 'Action failed.', { id: toastId });
      return false;
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Action failed.', { id: toastId });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const askSuspend = (c) =>
    setDialog({
      title: 'Suspend Caseworker',
      message: `Suspend ${c.fullName}? They will lose dashboard access until reactivated.`,
      confirmLabel: 'Suspend',
      danger: true,
      onConfirm: async () => {
        setDialog(null);
        await patch(c.uid, 'suspend');
      },
    });

  const askReactivate = (c) =>
    setDialog({
      title: 'Reactivate Caseworker',
      message: `Reactivate ${c.fullName}?`,
      confirmLabel: 'Reactivate',
      danger: false,
      onConfirm: async () => {
        setDialog(null);
        await patch(c.uid, 'reactivate');
      },
    });

  const askDeactivate = (c) =>
    setDialog({
      title: 'Deactivate Caseworker',
      message: `Deactivate ${c.fullName}? This is a soft-delete and preserves historical data.`,
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        setDialog(null);
        setBusy(true);
        const toastId = toast.loading('Deactivating…');
        try {
          const res = await axiosSecure.delete('/api/admin/caseworkers', {
            data: { uid: c.uid },
          });
          if (res.data?.success) {
            toast.success(res.data.message || 'Caseworker deactivated.', { id: toastId });
            await load();
          } else {
            toast.error(res.data?.error || 'Failed to deactivate.', { id: toastId });
          }
        } catch (err) {
          toast.error(err?.response?.data?.error || 'Failed to deactivate.', { id: toastId });
        } finally {
          setBusy(false);
        }
      },
    });

  const saveDetails = async () => {
    if (!selectedPractice) {
      toast.error('Please select a Practice before saving.');
      return;
    }
    const hp = Number(editHandlerPct);
    const hq = Number(editHqPct);
    const el = Number(editElPct);
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
    // Must total exactly 100%: resolveSplit() replaces any other total with the
    // role defaults at approval time, so a split that misses 100 by even a
    // fraction would be saved but never used.
    if (Math.abs(hp + hq + el - 100) > SPLIT_TOLERANCE) {
      toast.error(`The three percentages must total exactly 100% (currently ${round2(hp + hq + el)}%).`);
      return;
    }
    const ok = await patch(editing.uid, 'updateDetails', {
      practiceId: selectedPractice,
      jobTitle: editJobTitle,
      handlerParcentage: hp,
      hqParcentage: hq,
      elParcentage: el,
    });
    if (ok) {
      setEditing(null);
      setSelectedPractice('');
    }
  };

  // Live guard for the three inputs in the edit dialog: the server refuses any
  // total other than 100%, and resolveSplit() would swap the role defaults in at
  // approval time anyway, so the save button is disabled until it balances.
  const editSplitTotal =
    (Number(editHandlerPct) || 0) + (Number(editHqPct) || 0) + (Number(editElPct) || 0);
  // Compared raw rather than rounded so this gate is exactly as strict as the
  // API and as resolveSplit(), which use the same 0.001 tolerance before the
  // stored split is either honoured or replaced by the role defaults.
  const editSplitValid = Math.abs(editSplitTotal - 100) <= SPLIT_TOLERANCE;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} caseworker{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search caseworkers…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm animate-pulse">
              <div className="flex items-center gap-3">
                <div className="size-11 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center text-gray-500">
          No caseworkers found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((c) => {
            const active = c.accountStatus === 'ACTIVE';
            // A stored split is only honoured when it totals exactly 100%;
            // resolveSplit() substitutes the role defaults for anything else.
            // Compared raw (not rounded) so a split resolveSplit() would reject can
            // never show up as a green badge.
            const splitTotal =
              (Number(c.handlerParcentage) || 0) + (Number(c.hqParcentage) || 0) + (Number(c.elParcentage) || 0);
            const splitOk = c.handlerParcentage != null && Math.abs(splitTotal - 100) <= SPLIT_TOLERANCE;
            return (
              <div key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={c.fullName} photoURL={c.photoURL} size="size-12" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.fullName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.email}</p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusStyles[c.accountStatus] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {c.accountStatus}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Practice</span>
                    <span className="text-right font-medium text-gray-900 dark:text-gray-100">
                      {c.practiceName ? c.practiceName : <span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Not assigned</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Title</span>
                    <span className="text-right font-medium text-gray-900 dark:text-gray-100">{c.jobTitle || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Split</span>
                    {splitOk ? (
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {`${c.handlerParcentage}% / ${c.hqParcentage}% / ${c.elParcentage}%`}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-right font-semibold text-amber-600"
                        title={
                          c.handlerParcentage == null
                            ? 'No split configured, so the role default (50/10/40) is used at approval.'
                            : `Totals ${round2(splitTotal)}%, not 100% — the role default is used instead.`
                        }
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {c.handlerParcentage != null
                          ? `${c.handlerParcentage}% / ${c.hqParcentage}% / ${c.elParcentage}% = ${round2(splitTotal)}%`
                          : 'Not set — default used'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Approved</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(c);
                      setSelectedPractice(c.practiceId || '');
                      setEditJobTitle(c.jobTitle || '');
                      setEditHandlerPct(c.handlerParcentage != null ? String(c.handlerParcentage) : '50');
                      setEditHqPct(c.hqParcentage != null ? String(c.hqParcentage) : '10');
                      setEditElPct(c.elParcentage != null ? String(c.elParcentage) : '40');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {active ? (
                    <button type="button" onClick={() => askSuspend(c)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                      <Ban className="h-3.5 w-3.5" /> Suspend
                    </button>
                  ) : (
                    <button type="button" onClick={() => askReactivate(c)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                      <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                    </button>
                  )}
                  <button type="button" onClick={() => askDeactivate(c)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" /> Deactivate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}





      <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        danger={dialog?.danger}
        loading={busy}
        onConfirm={dialog?.onConfirm}
        onClose={() => setDialog(null)}
      />

      {/* Edit practice dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Edit Caseworker
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {editing.fullName} — {editing.email}
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
              Title
            </label>
            <input
              type="text"
              value={editJobTitle}
              onChange={(e) => setEditJobTitle(e.target.value)}
              placeholder="e.g. Senior Partner"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                Revenue Percentage
              </p>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    Handler %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editHandlerPct}
                    onChange={(e) => setEditHandlerPct(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    HQ %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editHqPct}
                    onChange={(e) => setEditHqPct(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    EL %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editElPct}
                    onChange={(e) => setEditElPct(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <p
                className={`mt-2 text-[11px] font-semibold ${
                  editSplitValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'
                }`}
              >
                Total: {round2(editSplitTotal)}% — must equal 100%
                {editSplitValid ? '' : ' (anything else is replaced by the default split)'}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDetails}
                disabled={busy || !editSplitValid}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

