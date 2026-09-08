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
} from 'lucide-react';

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
          <div className="min-w-0">
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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

