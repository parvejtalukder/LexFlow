'use client';

export default function TableSkeleton({ cols = 5, rows = 8 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100 dark:border-gray-800/60 last:border-0">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-4">
              <div className="h-3.5 w-full max-w-[160px] animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
