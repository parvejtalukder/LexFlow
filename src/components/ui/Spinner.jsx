import { cn } from '@/lib/utils';

/**
 * Inline loading spinner. Inherits the surrounding text colour via
 * `currentColor`, so it works on light and dark surfaces without variants.
 *
 * @param {number} size   pixel diameter (default 16)
 * @param {string} className extra classes (e.g. `text-white`)
 */
export default function Spinner({ size = 16, className, label = 'Loading' }) {
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={cn('inline-block shrink-0 animate-spin', className)}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
