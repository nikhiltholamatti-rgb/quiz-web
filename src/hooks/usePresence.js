import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Hook to manage Supabase Presence in the 'lobby' channel
 *
 * @param {Object} options
 * @param {boolean} [options.isHost=false]
 * @param {Object|null} [options.trackData=null] - { usn, name }
 */
export function usePresence({ isHost = false, trackData = null } = {}) {
  const [playerCount, setPlayerCount] = useState(0);
  const [recentPlayers, setRecentPlayers] = useState([]); // List of recent players for terminal log
  const [connected, setConnected] = useState(false);

  const channelRef = useRef(null);
  const trackDataRef = useRef(trackData);
  trackDataRef.current = trackData;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let isMounted = true;
    const channel = supabase.channel('lobby', {
      config: {
        presence: {
          key: trackDataRef.current?.usn || (isHost ? 'host_terminal' : `user_${Math.random().toString(36).slice(2, 7)}`),
        },
      },
    });

    channelRef.current = channel;

    // Helper to calculate unique players from presence state
    const updatePresenceState = () => {
      if (!isMounted) return;
      const state = channel.presenceState();
      const uniquePlayersMap = new Map();

      Object.keys(state).forEach((key) => {
        const presences = state[key];
        if (Array.isArray(presences)) {
          presences.forEach((p) => {
            if (p.usn && p.name && !p.usn.startsWith('host_')) {
              uniquePlayersMap.set(p.usn, p);
            }
          });
        }
      });

      const uniqueList = Array.from(uniquePlayersMap.values());
      setPlayerCount(uniqueList.length);

      if (isHost) {
        // Sort descending by joined_at without slicing
        const sorted = [...uniqueList].sort((a, b) => (b.joined_at || 0) - (a.joined_at || 0));
        setRecentPlayers(sorted);
      }
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        updatePresenceState();
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        if (!isMounted) return;
        if (isHost && Array.isArray(newPresences)) {
          setRecentPlayers((prev) => {
            const additions = newPresences.filter(p => p.usn && !p.usn.startsWith('host_'));
            const combined = [...additions, ...prev];
            // Deduplicate by USN
            const map = new Map();
            combined.forEach(item => {
              if (item.usn && !map.has(item.usn)) map.set(item.usn, item);
            });
            return Array.from(map.values()).sort((a, b) => (b.joined_at || 0) - (a.joined_at || 0));
          });
        }
        updatePresenceState();
      })
      .on('presence', { event: 'leave' }, () => {
        updatePresenceState();
      })
      .subscribe(async (status) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          if (trackDataRef.current && trackDataRef.current.usn && trackDataRef.current.name) {
            await channel.track({
              usn: trackDataRef.current.usn,
              name: trackDataRef.current.name,
              email: trackDataRef.current.email || trackDataRef.current.usn,
              joined_at: Date.now(),
            });
          }
        } else {
          setConnected(false);
        }
      });

    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isHost, trackData?.usn, trackData?.name, trackData?.email]);

  return { playerCount, recentPlayers, connected };
}
