'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { Users, Inbox, Briefcase, CreditCard } from 'lucide-react';

export default function DashboardOverview() {
  const { role } = useAuth();
  const axiosSecure = useAxiosSecure();
  const [stats, setStats] = useState({ totalUsers: 0, pendingRequests: 0 });
  const [loading, setLoading] = useState(true);

  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const loadStats = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [usersRes, appsRes] = await Promise.all([
        axiosSecure.get('/api/admin/users'),
        axiosSecure.get('/api/admin/applications'),
      ]);
      setStats({
        totalUsers: usersRes.data?.users?.length ?? 0,
        pendingRequests: appsRes.data?.applications?.length ?? 0,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load dashboard stats.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, isAdmin]);

  useEffect(() => {
    const id = setTimeout(loadStats, 0);
    return () => clearTimeout(id);
  }, [loadStats]);

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, tint: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300' },
    { label: 'Pending Requests', value: stats.pendingRequests, icon: Inbox, tint: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300' },
    { label: 'Active Cases', value: '—', icon: Briefcase, tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300' },
    { label: 'Payments (Month)', value: '—', icon: CreditCard, tint: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300' },
  ];

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Welcome back
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Use the sidebar to manage your cases, requests and profile.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${c.tint}`}>
                <c.icon className="h-5 w-5" />
              </div>
            </div>
            <h3 className="font-medium text-gray-600 dark:text-gray-400 mb-1">
              {c.label}
            </h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {loading ? '…' : c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Quick actions
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Use <strong>All Requests</strong> to review caseworker applications and{' '}
          <strong>All Users</strong> to manage staff accounts.
        </p>
      </div>
    </div>
  );
}
