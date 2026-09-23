'use client';

import { useCallback, useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import toast from 'react-hot-toast';
import Avatar from '@/components/ui/Avatar';
import {
  Phone,
  MapPin,
  Briefcase,
  Hash,
  Percent,
  Calendar,
  ShieldCheck,
  Clock,
  Mail,
  User as UserIcon,
  Pencil,
  Save,
  X,
} from 'lucide-react';

const INPUT =
  'w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </span>
      <span className="text-right text-sm font-medium text-gray-900 dark:text-gray-100">
        {value || '—'}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function Badge({ children, className }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${className}`}
    >
      {children}
    </span>
  );
}

export default function MyProfile() {
  const axiosSecure = useAxiosSecure();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/users/me');
      if (res.data?.success) setProfile(res.data.profile);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  // ---- self-service editing ------------------------------------------------
  // Only the fields the API accepts for a user's own record. Role, status,
  // practice and the revenue percentages are administrator-managed and stay
  // read-only on this page.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    address: '',
    jobTitle: '',
    registrationNumber: '',
    photoURL: '',
  });

  const startEdit = () => {
    setForm({
      fullName: profile?.fullName || '',
      phone: profile?.phone || '',
      address: profile?.address || '',
      jobTitle: profile?.jobTitle || '',
      registrationNumber: profile?.registrationNumber || '',
      photoURL: profile?.photoURL || '',
    });
    setEditing(true);
  };

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const save = async () => {
    if (!form.fullName.trim()) {
      toast.error('Full name cannot be empty.');
      return;
    }
    setSaving(true);
    const toastId = toast.loading('Saving your profile…');
    try {
      const res = await axiosSecure.patch('/api/users/me', form);
      if (res.data?.success) {
        setProfile(res.data.profile);
        setEditing(false);
        toast.success('Profile updated.', { id: toastId });
      } else {
        toast.error(res.data?.error || 'Failed to update your profile.', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update your profile.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm animate-pulse">
          <div className="flex items-center gap-4">
            <div className="size-20 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3.5 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-12 text-center text-gray-500">
        No profile found.
      </div>
    );
  }

  const split = profile.handlerParcentage != null
    ? `${profile.handlerParcentage}% / ${profile.hqParcentage}% / ${profile.elParcentage}%`
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar name={profile.fullName} photoURL={profile.photoURL} size="size-20" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-serif font-bold text-gray-900 dark:text-gray-100">
              {profile.fullName}
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              <Mail className="h-4 w-4" /> {profile.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200">{profile.role}</Badge>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">{profile.accountStatus}</Badge>
            </div>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Pencil className="h-4 w-4" /> Edit profile
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {editing ? (
          <div className="md:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Edit your details
                </h3>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  Your role, account status, practice and revenue percentages are managed by an
                  administrator and cannot be changed here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Full name
                </span>
                <input value={form.fullName} onChange={set('fullName')} maxLength={120} className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Phone
                </span>
                <input value={form.phone} onChange={set('phone')} maxLength={40} className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Job title
                </span>
                <input value={form.jobTitle} onChange={set('jobTitle')} maxLength={120} className={INPUT} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Registration no.
                </span>
                <input
                  value={form.registrationNumber}
                  onChange={set('registrationNumber')}
                  maxLength={60}
                  className={INPUT}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Address
                </span>
                <input value={form.address} onChange={set('address')} maxLength={240} className={INPUT} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Profile photo URL
                </span>
                <input
                  value={form.photoURL}
                  onChange={set('photoURL')}
                  maxLength={500}
                  placeholder="https://…"
                  className={INPUT}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <Section title="Personal Information">
              <Field icon={UserIcon} label="Full Name" value={profile.fullName} />
              <Field icon={Mail} label="Email" value={profile.email} />
              <Field icon={Phone} label="Phone" value={profile.phone} />
              <Field icon={MapPin} label="Address" value={profile.address} />
            </Section>

            <Section title="Professional">
              <Field icon={Briefcase} label="Job Title" value={profile.jobTitle} />
              <Field icon={Hash} label="Registration No." value={profile.registrationNumber} />
              <Field icon={Hash} label="Staff ID" value={profile.staffId} />
              <Field icon={Briefcase} label="Practice" value={profile.practiceName} />
            </Section>
          </>
        )}

        <Section title="Revenue Percentage">
          <Field
            icon={Percent}
            label="Split (Handler / HQ / EL)"
            value={split || 'Not assigned'}
          />
          <Field icon={Percent} label="Handler" value={profile.handlerParcentage != null ? `${profile.handlerParcentage}%` : null} />
          <Field icon={Percent} label="Head Office" value={profile.hqParcentage != null ? `${profile.hqParcentage}%` : null} />
          <Field icon={Percent} label="East London" value={profile.elParcentage != null ? `${profile.elParcentage}%` : null} />
        </Section>

        <Section title="Account">
          <Field icon={ShieldCheck} label="Role" value={profile.role} />
          <Field icon={ShieldCheck} label="Status" value={profile.accountStatus} />
          <Field icon={Calendar} label="Joining Date" value={fmtDate(profile.joiningDate)} />
          <Field icon={Calendar} label="Approved At" value={fmtDate(profile.approvedAt)} />
          <Field icon={Clock} label="Member Since" value={fmtDate(profile.createdAt)} />
        </Section>
      </div>
    </div>
  );
}

