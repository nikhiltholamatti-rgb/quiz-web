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
        // Method 1: Call RPC returning epoch milliseconds directly from PostgreSQL clock_timestamp()
        // This avoids browser CORS header stripping of HTTP Date headers
        const { data: serverTimeMs, error } = await supabase.rpc('get_server_time');
        const t1 = Date.now();

        if (!error && typeof serverTimeMs === 'number') {
          const roundTrip = t1 - t0;
          const estimatedServerNow = serverTimeMs + Math.floor(roundTrip / 2);
          const computedOffset = estimatedServerNow - t1;
          if (isMounted) {
            setOffset(computedOffset);
            setIsSynced(true);
          }
          return;
        }
      } catch (err) {
        console.warn('RPC server clock sync failed, checking fallback:', err);
      }

      try {
        const t0 = Date.now();
        // Method 2 (Fallback): Query REST endpoint header if available
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
          const estimatedServerNow = serverTimeMs + Math.floor(roundTrip / 2);
          const computedOffset = estimatedServerNow - t1;
          setOffset(computedOffset);
          setIsSynced(true);
          return;
        }
      } catch (err) {
        console.warn('Server clock fallback sync failed:', err);
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
