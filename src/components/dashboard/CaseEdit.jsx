'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import PageSkeleton from '@/templates/loader/PageSkeleton';

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

// Only the working statuses are editable here. Approval and rejection stay on
// the Cases table's review actions, because those routes also freeze the
// approver, the timestamp and the profit split into the audit trail.
const STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'];

const money = (v) =>
  v == null ? '—' : `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

/**
 * Admin-only case editor. The fields mirror what `PATCH /api/cases/[id]`
 * accepts, and the server recomputes VAT/total whenever the price or the VAT
 * flag changes, so the preview here is only a hint.
 */
export default function CaseEdit({ id }) {
  const axiosSecure = useAxiosSecure();
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [form, setForm] = useState(null);
  const [handlers, setHandlers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get(`/api/cases/${id}`);
      if (res.data?.success) {
        const c = res.data.case || {};
        setForm({
          title: c.title || '',
          description: c.description || '',
          category: c.category || '',
          priority: c.priority || 'MEDIUM',
          status: c.status || 'OPEN',
          helperName: c.helperName || '',
          clientName: c.client?.name || '',
          clientEmail: c.client?.email || '',
          clientPhone: c.client?.phone || '',
          clientAddress: c.client?.address || '',
          clientDob: c.client?.dob || '',
          clientReference: c.client?.reference || '',
          dealPrice: c.dealPrice != null ? String(c.dealPrice) : '',
          isVat: !!c.isVat,
          handlerId: c.handlerId || '',
        });
      }

      if (isAdmin) {
        const handlersRes = await axiosSecure.get('/api/admin/handlers');
        if (handlersRes.data?.success) setHandlers(handlersRes.data.handlers || []);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to load this case.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, id, isAdmin]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading || !form) return <PageSkeleton stats={2} charts={0} table />;

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Live VAT preview (the server recalculates authoritatively on save).
  const dealBase = Number(form.dealPrice) || 0;
  const dealVat = form.isVat ? Math.round(dealBase * 0.2 * 100) / 100 : 0;
  const dealTotal = Math.round((dealBase + dealVat) * 100) / 100;

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('The case reason is required.');
      return;
    }
    const price = Number(form.dealPrice);
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Deal price must be a non-negative number.');
      return;
    }

    setBusy(true);
    const toastId = toast.loading('Saving case…');
    try {
      const res = await axiosSecure.patch(`/api/cases/${id}`, {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        status: form.status,
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
        handlerId: form.handlerId || undefined,
      });
      if (res.data?.success) {
        toast.success('Case updated.', { id: toastId });
        router.push(`/dashboard/cases/${id}`);
      } else {
        toast.error(res.data?.error || 'Failed to update case.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update case.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link
        href={`/dashboard/cases/${id}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Case
      </Link>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit Case</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Saving rewrites the case record; adding or removing documents stays on the cases table.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Case Reason *
            </label>
            <input
              value={form.title}
              onChange={set('title')}
              placeholder="Subject / reason of the case"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Category
            </label>
            <select
              value={form.category}
              onChange={set('category')}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Priority
            </label>
            <select
              value={form.priority}
              onChange={set('priority')}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Status
            </label>
            <select
              value={form.status}
              onChange={set('status')}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Handler
            </label>
            <select
              value={form.handlerId}
              onChange={set('handlerId')}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Leave unchanged</option>
              {handlers.map((h) => (
                <option key={h.uid || h.id} value={h.uid || h.id}>
                  {h.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Assisted By (optional)
            </label>
            <input
              value={form.helperName}
              onChange={set('helperName')}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
              Deal Price (£) {form.isVat ? '(excl. VAT)' : ''}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.dealPrice}
              onChange={set('dealPrice')}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.isVat}
                onChange={(e) => setForm((prev) => ({ ...prev, isVat: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Add 20% VAT
            </label>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2 sm:col-span-2">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Total (price + VAT)
            </p>
            <p className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
              {dealTotal > 0 ? money(dealTotal) : '—'}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {form.isVat ? `VAT ${money(dealVat)}` : 'No VAT on this case'}
            </p>
          </div>
        </div>

        <h3 className="mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">Client</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { key: 'clientName', label: 'Name' },
            { key: 'clientEmail', label: 'Email' },
            { key: 'clientPhone', label: 'Phone' },
            { key: 'clientReference', label: 'Reference' },
            { key: 'clientDob', label: 'Date of birth', type: 'date' },
            { key: 'clientAddress', label: 'Address' },
          ].map(({ key, label, type = 'text' }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1">
                {label}
              </label>
              <input
                type={type}
                value={form[key]}
                onChange={set(key)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Link
            href={`/dashboard/cases/${id}`}
            className="px-4 py-2 text-center text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50"
          >
            {busy ? (
              <>
                <Spinner size={14} className="mr-2" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}