import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Hook to manage live game_state subscription and polling fallback
 */
export function useGameState() {
  const [gameState, setGameState] = useState({
    phase: 'lobby',
    started_at: null,
    duration_seconds: 300,
    session_id: 1,
    loading: true,
    error: null,
  });

  const channelRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const fetchGameState = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setGameState((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('game_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.warn('Error fetching game_state:', error.message);
        setGameState((prev) => ({ ...prev, error: error.message, loading: false }));
        return;
      }

      if (data) {
        setGameState({
          phase: data.phase || 'lobby',
          started_at: data.started_at || null,
          duration_seconds: data.duration_seconds || 300,
          session_id: data.session_id || 1,
          loading: false,
          error: null,
        });
      } else {
        setGameState((prev) => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.warn('Network exception fetching game_state:', err);
      setGameState((prev) => ({ ...prev, error: err.message, loading: false }));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Initial fetch
    fetchGameState();

    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    // 2. Set up Realtime subscription
    function setupSubscription() {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel(`game_state_live_${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_state' },
          (payload) => {
            if (!isMounted) return;
            const updated = payload.new;
            if (updated) {
              setGameState({
                phase: updated.phase || 'lobby',
                started_at: updated.started_at || null,
                duration_seconds: updated.duration_seconds || 300,
                session_id: updated.session_id || 1,
                loading: false,
                error: null,
              });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`Realtime channel status ${status}, scheduling reconnect...`);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isMounted) {
                fetchGameState();
                setupSubscription();
              }
            }, 2000);
          }
        });

      channelRef.current = channel;
    }

    setupSubscription();

    // 3. Safety net: On tab refocus / visibility visible, re-fetch game_state once
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchGameState();
      }
    };

    const handleFocus = () => {
      fetchGameState();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // 4. StrictMode cleanup
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchGameState]);

  return { ...gameState, refetch: fetchGameState };
}
