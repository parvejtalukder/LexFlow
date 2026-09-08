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
import TableSkeleton from '@/components/ui/TableSkeleton';

const PER_PAGE = 8;

const statusStyles = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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

  const savePractice = async () => {
    if (!selectedPractice) {
      toast.error('Please select a Practice before saving.');
      return;
    }
    const ok = await patch(editing.uid, 'updatePractice', { practiceId: selectedPractice });
    if (ok) {
      setEditing(null);
      setSelectedPractice('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} caseworker{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Practice</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Approved At</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <TableSkeleton cols={6} rows={8} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No caseworkers found.
                  </td>
                </tr>
              ) : (
                paginated.map((c) => {
                  const active = c.accountStatus === 'ACTIVE';
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 dark:border-gray-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {c.fullName}
                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                          {c.uid ? c.uid.slice(0, 14) + '…' : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.email}</td>
                      <td className="px-4 py-3">
                        {c.practiceName ? (
                          <span className="text-gray-700 dark:text-gray-200">{c.practiceName}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5" /> Not assigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            statusStyles[c.accountStatus] || 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {c.accountStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(c);
                              setSelectedPractice(c.practiceId || '');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          {active ? (
                            <button
                              type="button"
                              onClick={() => askSuspend(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              <Ban className="h-3.5 w-3.5" /> Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => askReactivate(c)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => askDeactivate(c)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>


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
              Edit Practice
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
                onClick={savePractice}
                disabled={busy}
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

