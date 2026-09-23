'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { ArrowLeft, FileText, Pencil } from 'lucide-react';
import PageSkeleton from '@/templates/loader/PageSkeleton';

const money = (v) =>
  v == null ? '—' : `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

const statusTone = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  OPEN: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
  CLOSED: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  REJECTED: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
};

const priorityTone = {
  LOW: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  HIGH: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
  URGENT: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
};

const fmtSize = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

function Badge({ value, styles }) {
  if (!value) return null;
  const tone = styles[value] || styles.CLOSED;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-gray-800/60 py-2.5 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-right text-sm text-gray-900 dark:text-gray-100">{value ?? '—'}</span>
    </div>
  );
}

/**
 * Read-only case view, opened from the View action on the Cases table. The API
 * allows an admin or the case's own handler, so a caseworker can open the same
 * page for the work assigned to them — the Edit shortcut is admin-only.
 */
export default function CaseDetail({ id }) {
  const axiosSecure = useAxiosSecure();
  const { role } = useAuth();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get(`/api/cases/${id}`);
      if (res.data?.success) setC(res.data.case || null);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to load this case.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, id]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  /** Media-library files are served behind auth, so open them as a blob. */
  const openDocument = async (doc) => {
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

  if (loading) return <PageSkeleton stats={2} charts={0} table />;

  if (!c) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500 dark:text-gray-400">This case could not be found.</p>
        <Link href="/dashboard/cases" className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
          Back to Cases
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/cases"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Cases
        </Link>
        {isAdmin && (
          <Link
            href={`/dashboard/cases/${id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Case
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{c.title}</h2>
        <p className="mt-1 font-mono text-xs text-gray-400">{c.caseNumber}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge value={c.status} styles={statusTone} />
          <Badge value={c.priority} styles={priorityTone} />
          {c.category ? (
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {c.category}
            </span>
          ) : null}
          {c.isVat ? (
            <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              +VAT
            </span>
          ) : null}
        </div>
        {c.description ? (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{c.description}</p>
        ) : null}
        {c.rejectionReason ? (
          <p className="mt-3 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            Rejected: {c.rejectionReason}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Client</h3>
          <div className="mt-2">
            <Row label="Name" value={c.client?.name} />
            <Row label="Email" value={c.client?.email} />
            <Row label="Phone" value={c.client?.phone} />
            <Row label="Address" value={c.client?.address} />
            <Row label="Date of birth" value={c.client?.dob} />
            <Row label="Reference" value={c.client?.reference} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Case &amp; money</h3>
          <div className="mt-2">
            <Row label="Handler" value={c.handlerName ? `${c.handlerName}${c.handlerType ? ` (${c.handlerType})` : ''}` : null} />
            <Row label="Assisted By" value={c.helperName} />
            <Row label="Deal price" value={money(c.dealPrice)} />
            <Row label="VAT" value={money(c.vatAmount)} />
            <Row label="Total" value={money(c.totalAmount)} />
            <Row label="Created by" value={c.createdBy} />
            <Row label="Created" value={c.createdAt ? new Date(c.createdAt).toLocaleString() : null} />
            <Row label="Last updated" value={c.updatedAt ? new Date(c.updatedAt).toLocaleString() : null} />
            <Row label="Approved" value={c.approvedAt ? new Date(c.approvedAt).toLocaleString() : null} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Documents</h3>
          <span className="text-xs text-gray-400">{c.documentCount || 0} attached</span>
        </div>
        {c.documents?.length ? (
          <div className="mt-3 space-y-2">
            {c.documents.map((d) => (
              <button
                key={d.id || d.fileName}
                type="button"
                onClick={() => openDocument(d)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <span className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                  <FileText className="h-4 w-4 text-gray-400" /> {d.fileName}
                </span>
                <span className="text-[11px] text-gray-400">{fmtSize(d.sizeBytes)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No documents are attached to this case.
          </p>
        )}
      </div>
    </div>
  );
}