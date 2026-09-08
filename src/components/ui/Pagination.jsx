'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, totalItems, perPage = 8, onChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Page {page} of {totalPages} · {totalItems} total
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
