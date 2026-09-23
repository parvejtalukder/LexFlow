'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Mail, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuth from '@/hooks/useAuth';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import { SectionCard } from '@/components/dashboard/wallet/WalletUI';

const INPUT =
  'w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

/**
 * Password reset.
 *
 * Firebase sends the email and owns the single-use link, so there is nothing to
 * store, expire or invalidate here. The confirmation is deliberately neutral:
 * it reads the same whether or not the address has an account, so the form
 * cannot be used to discover who is registered.
 */
export default function PasswordReset() {
  const { user, role, sendReset } = useAuth();
  const axiosSecure = useAxiosSecure();
  const isAdmin = String(role || '').toLowerCase() === 'admin';

  const [email, setEmail] = useState(user?.email || '');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');

  // Admin tool: reset someone else's password.
  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const selected = users.find((u) => u.uid === selectedUid) || null;

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await axiosSecure.get('/api/admin/users');
        if (!cancelled && res.data?.success) {
          setUsers((res.data.users || []).filter((u) => u.email));
        }
      } catch (err) {
        console.error(err);
      }
    };

    const id = setTimeout(load, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [isAdmin, axiosSecure]);

  /** Firebase emails the link straight to the user — works for any address. */
  const emailReset = async () => {
    if (!selected?.email) return;
    setEmailing(true);
    try {
      await sendReset(selected.email);
      toast.success(`Reset email sent to ${selected.email}.`);
    } catch (err) {
      console.error('Password reset error:', err?.code || err);
      toast.error('Firebase could not send that reset email.');
    } finally {
      setEmailing(false);
    }
  };

  /** For someone who cannot receive mail: produce the link and hand it over. */
  const generateLink = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const res = await axiosSecure.post('/api/admin/password-reset', { uid: selected.uid });
      if (res.data?.success) {
        setLink(res.data.link);
        setCopied(false);
        toast.success('Reset link generated.');
      } else {
        toast.error(res.data?.error || 'Failed to generate a link.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to generate a link.');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy — select the link and copy it manually.');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const target = String(email || '').trim();
    if (!target) {
      toast.error('Enter the email address on your account.');
      return;
    }

    setBusy(true);
    try {
      await sendReset(target);
    } catch (err) {
      // Report the same neutral outcome; keep the real reason for the console.
      console.error('Password reset error:', err?.code || err);
    } finally {
      setBusy(false);
      setSentTo(target);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Reset your password" subtitle="A secure link will be emailed to you">
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Email address
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSentTo('');
              }}
              placeholder="you@lawfirm.com"
              className={INPUT}
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" /> {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        {sentTo ? (
          <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
            If that address has an account, a reset link is on its way to {sentTo}. The link is
            single-use — check your spam folder if it does not arrive within a few minutes.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-gray-400">
            The link opens a secure page where you choose a new password. Until you finish that step
            your current password keeps working.
          </p>
        )}
      </SectionCard>

      {isAdmin ? (
        <SectionCard title="Reset someone's password" subtitle="Email the link, or hand one over">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              User
            </span>
            <select
              value={selectedUid}
              onChange={(e) => {
                setSelectedUid(e.target.value);
                setLink('');
              }}
              className={INPUT}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.fullName || 'Unnamed'} — {u.email} ({u.role})
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={emailReset}
              disabled={!selected || emailing}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {emailing ? 'Sending…' : 'Email the reset link'}
            </button>
            <button
              type="button"
              onClick={generateLink}
              disabled={!selected || generating}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              <KeyRound className="h-4 w-4" />{' '}
              {generating ? 'Generating…' : 'Generate a link to hand over'}
            </button>
          </div>

          <p className="mt-3 text-[11px] text-gray-400">
            <strong>Email the reset link</strong> has Firebase send it straight to that address.{' '}
            <strong>Generate a link</strong> is for someone who cannot receive mail — copy it and pass it
            on yourself. Either way the link is single-use and expires.
          </p>

          {link ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/60">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Reset link for {selected?.email}
              </p>
              <p className="mt-1 break-all text-[11px] text-gray-600 dark:text-gray-300">{link}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#080B1A] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a
                  href={`mailto:${selected?.email}?subject=${encodeURIComponent(
                    'Your LexFlow password reset link'
                  )}&body=${encodeURIComponent(
                    `Open this link to choose a new password:\n\n${link}\n`
                  )}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Mail className="h-3.5 w-3.5" /> Open in your email app
                </a>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : (
        <SectionCard title="Nothing arriving?" subtitle="Ask an administrator">
          <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            An administrator can email you a reset link, or generate one and pass it to you directly —
            useful if you cannot receive mail. Ask through the Help page.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
