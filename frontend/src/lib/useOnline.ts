// =============================================================================
// useOnline.ts — Hook that tracks network connectivity
// =============================================================================
// Returns true when the browser is online, false when offline.
// Listens to the browser's online/offline events so components re-render
// when connectivity changes.
// =============================================================================

import { useState, useEffect } from 'react';

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
