import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-id') &&
  supabaseUrl.startsWith('https://')
);

export const supabaseConfigError = !isSupabaseConfigured
  ? 'Missing or invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in environment variables.'
  : null;

// Single Supabase client instance across the application
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

/**
 * Health check helper for host monitor
 */
export async function checkSupabaseHealth() {
  if (!supabase) return { ok: false, error: 'Not configured' };
  try {
    const { data, error } = await supabase
      .from('game_state')
      .select('phase')
      .limit(1)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}
