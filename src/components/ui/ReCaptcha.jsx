'use client';

import { useEffect, useRef } from 'react';
import { RECAPTCHA_ENABLED } from '@/lib/recaptcha';

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
const SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';

let scriptPromise = null;

function ensureScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.grecaptcha && window.grecaptcha.render) return Promise.resolve();

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve) => {
      const existing = document.querySelector('script[src*="recaptcha/api.js"]');
      if (existing) {
        if (window.grecaptcha && window.grecaptcha.render) {
          resolve();
        } else {
          existing.addEventListener('load', () => resolve(), { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

export default function ReCaptcha({ onChange }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!RECAPTCHA_ENABLED) return;

    let cancelled = false;

    ensureScript().then(() => {
      if (cancelled || !containerRef.current || !window.grecaptcha?.render) return;

      widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onChangeRef.current?.(token),
        'expired-callback': () => onChangeRef.current?.(''),
        'error-callback': () => onChangeRef.current?.(''),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current != null && window.grecaptcha) {
        try {
          window.grecaptcha.reset(widgetIdRef.current);
        } catch (e) {
          // ignore reset errors
        }
      }
    };
  }, []);

  if (!RECAPTCHA_ENABLED) return null;

  return <div ref={containerRef} />;
}
