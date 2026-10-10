import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Hook to synchronize local client clock with server time.
 * Calculates offset = serverNow - Date.now().
 */
export function useServerClock() {
  const [offset, setOffset] = useState(0);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function syncClock() {
      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) setIsSynced(true);
        return;
      }

      try {
        const t0 = Date.now();
        // Lightweight request to read the response Date header from Supabase
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const res = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseAnonKey}`, {
          method: 'HEAD',
        });
        const t1 = Date.now();
        const roundTrip = t1 - t0;

        const serverDateHeader = res.headers.get('date');
        if (serverDateHeader && isMounted) {
          const serverTimeMs = new Date(serverDateHeader).getTime();
          // Adjust for half round-trip latency
          const estimatedServerNow = serverTimeMs + (roundTrip / 2);
          const computedOffset = estimatedServerNow - t1;
          setOffset(computedOffset);
          setIsSynced(true);
          return;
        }
      } catch (err) {
        console.warn('Server clock sync failed, defaulting offset to 0:', err);
      }

      if (isMounted) {
        setOffset(0);
        setIsSynced(true);
      }
    }

    syncClock();

    return () => {
      isMounted = false;
    };
  }, []);

  const getNow = () => Date.now() + offset;

  return { offset, isSynced, getNow };
}
