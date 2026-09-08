'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, FolderOpen, Loader2, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAxiosSecure from '@/hooks/useAxiosSecure';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const isImage = (mime) => (mime || '').startsWith('image/');

/** Renders an authenticated file. Images are fetched as a blob (with the auth
 *  token) so we never expose a public URL. */
function MediaThumb({ file }) {
  const axiosSecure = useAxiosSecure();
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!isImage(file.mimeType)) return undefined;

    let objectUrl = null;
    let cancelled = false;

    axiosSecure
      .get(file.url, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url, file.mimeType, axiosSecure]);

  if (!isImage(file.mimeType)) {
    return (
      <div className="flex h-24 w-full flex-col items-center justify-center gap-1 bg-slate-100 p-2">
        <FileText className="h-6 w-6 text-slate-500" />
        <span className="max-w-full truncate text-[10px] text-slate-500">
          {file.fileName}
        </span>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex h-24 w-full items-center justify-center bg-slate-100">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return <img src={src} alt={file.fileName} className="h-24 w-full object-cover" />;
}

export default function MediaLibrary({
  open,
  onClose,
  onSelect,
  accept = 'image/*,application/pdf',
  title = 'Media Library',
}) {
  const axiosSecure = useAxiosSecure();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosSecure.get('/api/media');
      if (res.data?.success) setFiles(res.data.files || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load media library.');
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      fetchFiles();
    }, 0);
    return () => clearTimeout(id);
  }, [open, fetchFiles]);

  const close = () => {
    setSelectedId(null);
    onClose();
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const toastId = toast.loading('Uploading file...');

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await axiosSecure.post('/api/media', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        toast.success(
          res.data.duplicate
            ? 'Duplicate detected — existing file reused.'
            : 'File uploaded.',
          { id: toastId }
        );
        await fetchFiles();
        if (res.data.file?.id) setSelectedId(res.data.file.id);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Upload failed.', { id: toastId });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleConfirm = () => {
    const file = files.find((f) => f.id === selectedId);
    if (!file) {
      toast.error('Select a file first.');
      return;
    }
    onSelect(file);
    setSelectedId(null);
  };

  const confirmDelete = async () => {
    const file = deleteTarget;
    if (!file) return;

    setDeleting(true);
    const toastId = toast.loading('Deleting file...');
    try {
      await axiosSecure.delete(file.url);
      toast.success('File deleted.', { id: toastId });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (selectedId === file.id) setSelectedId(null);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete file.', {
        id: toastId,
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-[#080B1A]">{title}</h2>
            <p className="text-xs text-slate-500">
              Choose an existing file or upload a new one. Duplicates are stored once.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3">
          <span className="text-xs font-semibold text-slate-600">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#080B1A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">
            <Upload className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload New'}
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading library…
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FolderOpen className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-[#080B1A]">No files yet</p>
              <p className="text-xs text-slate-400">
                Upload a file to add it to your library.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {files.map((file) => {
                const selected = file.id === selectedId;
                const deletable = !file.associatedType;
                return (
                  <div
                    key={file.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(file.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(file.id);
                      }
                    }}
                    className={`group relative cursor-pointer overflow-hidden rounded-xl border text-left transition ${
                      selected
                        ? 'border-blue-600 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="relative">
                      <MediaThumb file={file} />
                      {selected && (
                        <div className="absolute right-1 top-1 rounded-full bg-blue-600 p-0.5 text-white">
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </div>
                      )}
                      {deletable && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(file);
                          }}
                          className="absolute left-1 top-1 rounded-full bg-white/90 p-1 text-red-600 shadow-sm hover:bg-red-50"
                          aria-label="Delete file"
                          title="Delete file"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-[11px] font-medium text-slate-700">
                        {file.fileName}
                      </p>
                      <p className="truncate text-[10px] text-slate-400">
                        {file.associatedType
                          ? 'In use'
                          : isImage(file.mimeType)
                          ? 'Image'
                          : 'Document'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-[#080B1A] px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Use Selected
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete file"
        message={`Delete "${deleteTarget?.fileName}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}


