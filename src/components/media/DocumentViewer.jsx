"use client";

import { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import Spinner from '@/components/ui/Spinner';

/**
 * In-app document viewer.
 *
 * Media-library files are served behind auth (`/api/media/<id>`), so the bytes
 * are fetched as a blob and shown here inside a modal - a new browser tab would
 * leave the app (and, for authenticated files, is not directly loadable anyway).
 *
 * Lifecycle: open -> spinner while the blob is fetched -> preview, or a clear
 * explanation when the browser cannot render the type (Word documents, say).
 *
 * @param {{ url: string, fileName?: string, mimeType?: string, sizeBytes?: number }|null} file
 * @param {() => void} onClose
 */

const isImage = (mimeType) => String(mimeType || '').startsWith('image/');
const isPdf = (mimeType) => String(mimeType || '').toLowerCase().includes('pdf');

function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A failed blob request carries its JSON error body as a Blob, so the server's
 * message has to be read out of it before it can be shown.
 */
async function readErrorMessage(error) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.error || 'Failed to load this document.';
    } catch {
      return 'Failed to load this document.';
    }
  }
  return data?.error || error?.message || 'Failed to load this document.';
}

export default function DocumentViewer({ file, onClose }) {
  const axiosSecure = useAxiosSecure();
  // Keyed by url, so opening a different document shows the spinner again on its
  // own - no state has to be reset inside the effect (which would trigger a
  // cascading render).
  const [loaded, setLoaded] = useState(null);
  const [failed, setFailed] = useState(null);

  const url = file?.url || null;

  // Fetch the bytes, then hand back an object URL that is revoked on close.
  useEffect(() => {
    if (!url) return undefined;

    let cancelled = false;
    let created = null;

    axiosSecure
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        created = URL.createObjectURL(res.data);
        setLoaded({ url, src: created });
      })
      .catch(async (err) => {
        if (cancelled) return;
        setFailed({ url, message: await readErrorMessage(err) });
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, axiosSecure]);

  const src = loaded?.url === url ? loaded.src : null;
  const error = failed?.url === url ? failed.message : null;

  // Escape closes, and the page behind must not scroll while the viewer is open.
  useEffect(() => {
    if (!file) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [file, onClose]);

  if (!file) return null;

  const name = file.fileName || 'Document';
  const meta = [file.mimeType, formatSize(file.sizeBytes)].filter(Boolean).join(' · ');

  const download = () => {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    // Above the review dialog (z-50), because documents open from inside it.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Document: ${name}`}
        className="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</p>
            {meta && <p className="text-[11px] text-gray-500 dark:text-gray-400">{meta}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {src && (
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close document"
              className="grid size-8 place-content-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950/60">
          {error ? (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
              <FileText className="h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{error}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                The document may have been removed, or you may not have access to it.
              </p>
            </div>
          ) : !src ? (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
              <Spinner size={28} />
              <p className="text-sm">Loading document…</p>
            </div>
          ) : isImage(file.mimeType) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={name}
              className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
            />
          ) : isPdf(file.mimeType) ? (
            <iframe src={src} title={name} className="h-[80vh] w-full border-0" />
          ) : (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
              <FileText className="h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                This file type cannot be previewed in the browser.
              </p>
              <button
                type="button"
                onClick={download}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4" /> Download {name}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
