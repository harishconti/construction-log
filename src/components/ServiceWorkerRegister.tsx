'use client';

import { useEffect } from 'react';

/** Registers the app-shell service worker in production only. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration is best-effort */
    });
  }, []);

  return null;
}
