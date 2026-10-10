/**
 * Format seconds into MM:SS string with leading zeros
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTimeMMSS(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Format seconds into SS.s format for precision telemetry
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatSecondsDetailed(totalSeconds) {
  const num = Number(totalSeconds || 0);
  return num.toFixed(1) + 's';
}

/**
 * Calculate remaining seconds from started_at and duration_seconds with server clock offset.
 * Recomputed dynamically on each tick without trusting setInterval accumulation.
 *
 * @param {string|Date|null} startedAt - Server started_at timestamp
 * @param {number} durationSeconds - Game duration in seconds (default 300)
 * @param {number} offsetMs - Server time minus local time in milliseconds
 * @returns {number} Remaining seconds (>= 0)
 */
export function calculateRemainingSeconds(startedAt, durationSeconds = 300, offsetMs = 0) {
  if (!startedAt) return durationSeconds;

  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return durationSeconds;

  const endsAtMs = startMs + (durationSeconds * 1000);
  const currentSyncedTimeMs = Date.now() + (offsetMs || 0);
  const remainingMs = endsAtMs - currentSyncedTimeMs;

  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/**
 * Calculate elapsed seconds since start
 * @param {string|Date|null} startedAt
 * @param {number} offsetMs
 * @returns {number}
 */
export function calculateElapsedSeconds(startedAt, offsetMs = 0) {
  if (!startedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return 0;
  const currentSyncedTimeMs = Date.now() + (offsetMs || 0);
  const elapsedMs = currentSyncedTimeMs - startMs;
  return Math.max(0, Math.floor(elapsedMs / 1000));
}
