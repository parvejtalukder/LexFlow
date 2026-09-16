'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import { ArrowLeft, Briefcase, CreditCard, Mail, Phone, UserRound } from 'lucide-react';
import PageSkeleton from '@/templates/loader/PageSkeleton';
import { money } from '@/components/dashboard/wallet/WalletUI';

const statusStyles = {
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED: 'bg-red-50 text-red-600 border-red-200',
  UNREGISTERED: 'bg-gray-100 text-gray-600 border-gray-200',
  DEACTIVATED: 'bg-gray-100 text-gray-600 border-gray-200',
};

function Badge({ value, styles }) {
  if (!value) return <span className="text-gray-400">—</span>;
  const tone = styles[value] || styles.PENDING;
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
 * Read-only view of one user account, opened from the View action on the Users
 * and Caseworkers tables. Shows exactly what the list already exposed plus the
 * counts an admin needs before changing an account's status (cases, payments
 * and the wallet position derived from them).
 */
export default function UserDetail({ uid }) {
  const axiosSecure = useAxiosSecure();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get(`/api/admin/users/${uid}`);
      if (res.data?.success) {
        setUser(res.data.user || null);
        setStats(res.data.stats || null);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to load this user.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure, uid]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  if (loading) return <PageSkeleton stats={4} charts={0} table />;

  if (!user) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500 dark:text-gray-400">This user could not be found.</p>
        <Link href="/dashboard/users" className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
          Back to Users
        </Link>
      </div>
    );
  }

  const tiles = [
    { label: 'Cases handled', value: stats?.caseCount ?? '—', icon: Briefcase },
    { label: 'Payments recorded', value: stats?.paymentCount ?? '—', icon: CreditCard },
    { label: 'Total earned', value: money(stats?.totalEarned), icon: UserRound },
    { label: 'Withdrawn', value: money(stats?.totalWithdrawn) },
    { label: 'Available', value: money(stats?.available) },
    { label: 'Withdrawable now', value: money(stats?.withdrawable) },
  ];

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/users"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Users
      </Link>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-content-center rounded-full bg-gray-200 dark:bg-gray-700 text-lg font-bold text-gray-600 dark:text-gray-200 uppercase">
              {(user.fullName || '?').charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{user.fullName}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <Mail className="h-3.5 w-3.5" /> {user.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge value={user.role} styles={statusStyles} />
                <Badge value={user.accountStatus} styles={statusStyles} />
              </div>
            </div>
          </div>
          <span className="font-mono text-[11px] text-gray-400">{user.uid}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
              {Icon ? <Icon className="h-4 w-4 text-gray-400" /> : null}
            </div>
            <p className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Account</h3>
          <div className="mt-2">
            <Row label="Role" value={user.role} />
            <Row label="Account status" value={user.accountStatus} />
            <Row
              label="Phone"
              value={
                user.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-gray-400" /> {user.phone}
                  </span>
                ) : null
              }
            />
            <Row label="Job title" value={user.jobTitle} />
            <Row label="Registration no." value={user.registrationNumber} />
            <Row label="Joined" value={user.createdAt ? new Date(user.createdAt).toLocaleString() : null} />
            <Row label="Last updated" value={user.updatedAt ? new Date(user.updatedAt).toLocaleString() : null} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Earnings &amp; wallet</h3>
          <div className="mt-2">
            <Row label="Profit distributions" value={stats?.distributionCount ?? '—'} />
            <Row label="Withdrawal requests" value={stats?.withdrawalCount ?? '—'} />
            <Row label="Total earned" value={money(stats?.totalEarned)} />
            <Row label="Paid out" value={money(stats?.totalWithdrawn)} />
            <Row label="Reserved (pending)" value={money(stats?.pendingWithdrawalTotal)} />
            <Row label="Available" value={money(stats?.available)} />
            <Row label="Withdrawable now" value={money(stats?.withdrawable)} />
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Status changes and deactivation stay on the Users and Caseworkers tables, where every change is
        written to the audit log.
      </p>
    </div>
  );
}