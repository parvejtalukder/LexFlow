'use client';

import { useEffect, useState } from 'react';
import useAxiosSecure from '@/hooks/useAxiosSecure';

/** Renders a user avatar. Supports public http(s) URLs and authenticated
 *  /api/media/<id> URLs (fetched as a blob). Falls back to the initial. */
export default function Avatar({ name, photoURL, size = 'size-10' }) {
  const axiosSecure = useAxiosSecure();
  const [src, setSrc] = useState(null);

  const isPublic = typeof photoURL === 'string' && photoURL.startsWith('http');

  useEffect(() => {
    if (!photoURL || isPublic) return undefined;

    let objectUrl = null;
    let cancelled = false;

    axiosSecure
      .get(photoURL, { responseType: 'blob' })
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
  }, [photoURL, isPublic, axiosSecure]);

  if (isPublic && photoURL) {
    return (
      <img
        src={photoURL}
        alt={name || 'avatar'}
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    );
  }

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className={`${size} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${size} grid shrink-0 place-content-center rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-bold text-gray-600 dark:text-gray-200 uppercase`}
    >
      {(name || '?').charAt(0)}
    </div>
  );
}
