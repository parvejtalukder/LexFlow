'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';

/**
 * Loads `/api/wallet` once and hands the payload to whichever wallet page is
 * open. The endpoint already scopes itself by role — admins get firm-wide
 * figures (plus branch accounts), caseworkers get their own wallet — so every
 * page in this section shares the same request and just renders a different
 * slice of the response.
 *
 * @param {{ failureMessage?: string }} [options]
 * @returns {{ data: object|null, loading: boolean, isAdmin: boolean, reload: function }}
 */
export default function useWalletData({ failureMessage = 'Failed to load wallet.' } = {}) {
  const axiosSecure = useAxiosSecure();
  const { role } = useAuth();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/wallet');
      if (res.data?.success) setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(failureMessage);
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, failureMessage]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  return { data, loading, isAdmin, reload: load };
}