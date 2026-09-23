'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useAxiosSecure from '@/hooks/useAxiosSecure';

/**
 * Who to contact about this system.
 *
 * Reads /api/support/contact, which resolves the current administrators on the
 * server at request time. `contacts` is the complete list - every administrator
 * who can actually be reached - so the caller renders all of them rather than
 * picking one.
 *
 * `source` says what is being held: 'admin' (real people), 'mailbox' (a role
 * address such as support@), or 'none' - and on 'none' the UI must not offer an
 * email link at all.
 *
 * @param {{ failureMessage?: string }} [options]
 * @returns {{ contacts: Array<{ name: string|null, email: string }>, mailbox: string|null, source: string|null, loading: boolean, reload: function }}
 */
export default function useAdminContacts({
  failureMessage = 'Failed to load the administrator contact.',
} = {}) {
  const axiosSecure = useAxiosSecure();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/support/contact');
      if (res.data?.success) setData(res.data);
    } catch (err) {
      // Reported, not fatal: the panel degrades to "no contact shown" instead of
      // pointing at an address that could not be confirmed.
      console.error(err);
      toast.error(err?.response?.data?.error || failureMessage);
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, failureMessage]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  return {
    contacts: data?.contacts || [],
    mailbox: data?.mailbox || null,
    source: data?.source || null,
    loading,
    reload: load,
  };
}
