'use client';

import { COMPLAINT_STATUSES } from '@/lib/complaints';

/**
 * Complaint-specific presentation helpers.
 *
 * The generic pieces (SectionCard, SearchInput, FilterChip, matchesQuery) are
 * reused from the wallet UI kit so both features stay visually identical - only
 * the complaint vocabulary lives here.
 */

export const PER_PAGE = 10;

export const STATUS_LABELS = {
  [COMPLAINT_STATUSES.PENDING]: 'Pending',
  [COMPLAINT_STATUSES.IN_REVIEW]: 'In review',
  [COMPLAINT_STATUSES.RESOLVED]: 'Resolved',
  [COMPLAINT_STATUSES.DISMISSED]: 'Dismissed',
};

export const statusTone = {
  PENDING:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  IN_REVIEW:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  RESOLVED:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  DISMISSED:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

export function fmtDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StatusPill({ status }) {
  const key = status || COMPLAINT_STATUSES.PENDING;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        statusTone[key] || statusTone.PENDING
      }`}
    >
      {STATUS_LABELS[key] || key}
    </span>
  );
}

/**
 * The "edited" marker.
 *
 * Shows whenever a complaint was changed after it was filed, with the date of
 * the most recent edit and how many times it has been edited in total.
 */
export function EditedNote({ complaint, className = '' }) {
  if (!complaint?.editedAt) return null;
  const times = Number(complaint.editCount) || 1;

  return (
    <span className={`text-[11px] font-medium text-amber-600 dark:text-amber-400 ${className}`}>
      Edited {fmtDateTime(complaint.editedAt)}
      {times > 1 ? ` · edited ${times}×` : ''}
    </span>
  );
}
