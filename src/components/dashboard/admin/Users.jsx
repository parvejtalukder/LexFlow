'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import useAuth from '@/hooks/useAuth';
import toast from 'react-hot-toast';
import { Search, Users as UsersIcon, Briefcase, Trash2, Eye } from 'lucide-react';
import Caseworkers from './Caseworkers';
import Pagination from '@/components/ui/Pagination';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const PER_PAGE = 10;

/**
 * Roles an administrator may assign. `admin` is the highest level - there is no
 * superuser tier above it.
 */
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator' },
  { value: 'caseworker', label: 'Caseworker' },
  { value: 'applicant', label: 'Applicant' },
  { value: 'user', label: 'User' },
];

// Applicants/admins use 'APPROVED' while caseworkers use 'ACTIVE' for the same
// meaning. Now that accepted caseworkers also appear in this list, only offer
// the statuses that belong to the row's role so the two vocabularies cannot be
// mixed up.
const CASEWORKER_STATUS_OPTIONS = ['ACTIVE', 'SUSPENDED', 'REJECTED', 'DEACTIVATED'];
const DEFAULT_STATUS_OPTIONS = ['PENDING', 'APPROVED', 'REJECTED', 'DEACTIVATED'];

function statusOptionsFor(user) {
  const options =
    user?.role === 'caseworker' ? CASEWORKER_STATUS_OPTIONS : DEFAULT_STATUS_OPTIONS;

  // Never hide the current value, otherwise saving would silently rewrite it.
  return user?.accountStatus && !options.includes(user.accountStatus)
    ? [user.accountStatus, ...options]
    : options;
}

const statusStyles = {
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED: 'bg-red-50 text-red-600 border-red-200',
  UNREGISTERED: 'bg-gray-100 text-gray-600 border-gray-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUSPENDED: 'bg-amber-50 text-amber-700 border-amber-200',
  DEACTIVATED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const roleStyles = {
  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  caseworker: 'bg-blue-50 text-blue-700 border-blue-200',
  applicant: 'bg-amber-50 text-amber-700 border-amber-200',
  user: 'bg-gray-100 text-gray-600 border-gray-200',
};

function Badge({ value, styles }) {
  const style = styles[value] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {value || 'N/A'}
    </span>
  );
}

function UsersTable() {
  const axiosSecure = useAxiosSecure();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const [editingStatus, setEditingStatus] = useState(null);
  const [confirmingRole, setConfirmingRole] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/admin/users');
      if (res.data?.success) setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(fetchUsers, 0);
    return () => clearTimeout(id);
  }, [fetchUsers]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          (u.fullName || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.uid || '').toLowerCase().includes(q) ||
          (u.id || '').toLowerCase().includes(q) ||
          (u.role || '').toLowerCase().includes(q)
      )
    : users;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const applyChanges = async ({ user, accountStatus, role }) => {
    setBusy(true);
    const toastId = toast.loading('Updating user…');
    try {
      const res = await axiosSecure.patch('/api/admin/users', {
        uid: user.uid,
        role,
        accountStatus,
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'User updated successfully.', { id: toastId });
        await fetchUsers();
        setEditingStatus(null);
        setConfirmingRole(null);
      } else {
        toast.error(res.data?.error || 'Failed to update user.', { id: toastId });
      }
    } catch (err) {
      // The server's own wording explains the guards (own role, invalid role).
      toast.error(err?.response?.data?.error || 'Failed to update user.', { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = () => {
    const { user, accountStatus, role } = editingStatus;

    // Granting or removing administrator access is confirmed first: it is the
    // difference between seeing everything and seeing only your own work.
    const crossesAdmin = role !== user.role && (role === 'admin' || user.role === 'admin');
    if (crossesAdmin) {
      setConfirmingRole({ user, accountStatus, role, grant: role === 'admin' });
      return;
    }

    applyChanges({ user, accountStatus, role });
  };

  const confirmDelete = async () => {
    setBusy(true);
    const toastId = toast.loading('Deactivating user…');
    try {
      const res = await axiosSecure.delete('/api/admin/users', { data: { uid: deleting.uid } });
      if (res.data?.success) {
        toast.success('User deactivated successfully.', { id: toastId });
        await fetchUsers();
      } else {
        toast.error(res.data?.error || 'Failed to deactivate user.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to deactivate user.', { id: toastId });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} user{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email, user id…"
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Users table, scroll horizontally for more columns"
          tabIndex={0}
        >
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">User ID</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={7} rows={8} />
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <UsersIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No users found.
                  </td>
                </tr>
              ) : (
                paginated.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-gray-100 dark:border-gray-800/60 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-content-center rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-200 uppercase">
                          {(u.fullName || '?').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {u.fullName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                        {u.uid ? u.uid.slice(0, 12) + '…' : (u.id || '').slice(0, 12) + '…'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={u.role} styles={roleStyles} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={u.accountStatus} styles={statusStyles} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {u.uid ? (
                          <Link
                            href={`/dashboard/users/${u.uid}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingStatus({
                              user: u,
                              accountStatus: u.accountStatus,
                              role: u.role,
                            })
                          }
                          className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>


      <Pagination page={safePage} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />

      {editingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingStatus(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Change Role &amp; Status
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {editingStatus.user.fullName} — {editingStatus.user.email}
            </p>

            {editingStatus.user.uid === currentUser?.uid ? (
              <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  Role
                </p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                  <span className="capitalize">{editingStatus.user.role}</span> — this is your own
                  account, and an administrator cannot change his own role. Ask another administrator.
                </p>
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
                  Role
                </label>
                <select
                  value={editingStatus.role}
                  onChange={(e) =>
                    setEditingStatus((prev) => ({ ...prev, role: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {editingStatus.role === 'admin' && editingStatus.user.role !== 'admin' ? (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                    Administrators can see and change everything in the system.
                  </p>
                ) : null}
              </>
            )}

            {editingStatus.user.accountStatus === 'DEACTIVATED' ? (
              <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
                This account is deactivated, so they cannot sign in until the status is changed.
              </p>
            ) : null}

            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mt-4 mb-1">
              Account Status
            </label>
            <select
              value={editingStatus.accountStatus}
              onChange={(e) => setEditingStatus((prev) => ({ ...prev, accountStatus: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptionsFor(editingStatus.user).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setEditingStatus(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStatus}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#080B1A] hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Deactivate User"
        message={`Deactivate ${deleting?.fullName}? This is a soft-delete.`}
        confirmLabel="Deactivate"
        danger
        loading={busy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={!!confirmingRole}
        title={confirmingRole?.grant ? 'Give administrator access?' : 'Remove administrator access?'}
        message={
          confirmingRole
            ? confirmingRole.grant
              ? `${confirmingRole.user.fullName} will be able to see and change everything in the system.`
              : `${confirmingRole.user.fullName} will lose access to every administrative page and see only their own work.`
            : ''
        }
        confirmLabel={confirmingRole?.grant ? 'Make administrator' : 'Remove administrator'}
        danger={!confirmingRole?.grant}
        loading={busy}
        onConfirm={() => applyChanges(confirmingRole)}
        onClose={() => setConfirmingRole(null)}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-[#080B1A] text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function AdminUsers() {
  const [tab, setTab] = useState('users');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 w-fit">
        <TabButton
          active={tab === 'users'}
          onClick={() => setTab('users')}
          icon={<UsersIcon className="h-4 w-4" />}
          label="Users"
        />
        <TabButton
          active={tab === 'caseworkers'}
          onClick={() => setTab('caseworkers')}
          icon={<Briefcase className="h-4 w-4" />}
          label="Caseworkers"
        />
      </div>

      {tab === 'users' ? <UsersTable /> : <Caseworkers />}
    </div>
  );
}

