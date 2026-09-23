'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { exportStatementCsv, exportStatementPdf } from '@/lib/statementExport';

/**
 * Transaction History data.
 *
 * Filtering, sorting and paging all happen on the server, so the browser only
 * ever holds one page. `scope` is 'personal' for a caseworker and either
 * 'personal' or 'firm' for an admin (the server refuses 'firm' to anyone else).
 */
export default function useTransactions({
  scope = 'personal',
  filters = {},
  page = 1,
  pageSize = 20,
  failureMessage = 'Failed to load transactions.',
} = {}) {
  const axiosSecure = useAxiosSecure();
  const { role } = useAuth();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Serialise the query so the request only repeats on a real change: the
  // caller rebuilds the filters object on every render.
  const query = useMemo(() => {
    const params = new URLSearchParams({ scope, page: String(page), pageSize: String(pageSize) });
    ['from', 'to', 'type', 'status', 'account', 'q'].forEach((key) => {
      const value = filters?.[key];
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [scope, page, pageSize, filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get(`/api/wallet/transactions?${query}`);
      if (res.data?.success) setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || failureMessage);
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, query, failureMessage]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  return { data, loading, isAdmin, reload: load };
}

/**
 * Statement download (CSV / PDF).
 *
 * The file is rendered in the browser from the role-scoped payload returned by
 * /api/wallet/statement, so a statement can never include rows the user is not
 * allowed to see.
 */
export function useStatementDownload() {
  const axiosSecure = useAxiosSecure();
  const [busy, setBusy] = useState(null);

  const download = useCallback(
    async (format, { scope = 'personal', from, to, filters = {} } = {}) => {
      setBusy(format);
      const toastId = toast.loading(`Preparing ${String(format).toUpperCase()} statement…`);
      try {
        const params = new URLSearchParams({ scope });
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        ['type', 'status', 'account', 'q'].forEach((key) => {
          if (filters[key]) params.set(key, filters[key]);
        });

        const res = await axiosSecure.get(`/api/wallet/statement?${params.toString()}`);
        const payload = res.data;
        if (!payload?.success) throw new Error(payload?.error || 'Failed to build the statement.');

        if (!payload.transactions?.length) {
          toast.error('No transactions in that range to export.', { id: toastId });
          return;
        }

        const args = {
          scope: payload.scope,
          rows: payload.transactions,
          from: payload.range.from,
          to: payload.range.to,
        };

        if (format === 'csv') {
          exportStatementCsv(args);
        } else {
          await exportStatementPdf({ ...args, owner: payload.owner, totals: payload.totals });
        }

        toast.success(
          payload.capped
            ? `Statement downloaded — capped at ${payload.maxRows} rows; narrow the range for a complete copy.`
            : 'Statement downloaded.',
          { id: toastId }
        );
      } catch (err) {
        console.error(err);
        toast.error(
          err?.response?.data?.error || err?.message || 'Failed to download the statement.',
          { id: toastId }
        );
      } finally {
        setBusy(null);
      }
    },
    [axiosSecure]
  );

  return { download, busy };
}
