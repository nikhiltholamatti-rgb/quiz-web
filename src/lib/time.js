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
 * Recomputed dynamically on each tick from authoritative elapsed time without trusting setInterval accumulation.
 *
 * @param {string|Date|null} startedAt - Server started_at timestamp
 * @param {number} durationSeconds - Game duration in seconds (default 360)
 * @param {number} offsetMs - Server time minus local time in milliseconds
 * @returns {number} Remaining seconds (between 0 and durationSeconds)
 */
export function calculateRemainingSeconds(startedAt, durationSeconds = 360, offsetMs = 0) {
  const duration = Number(durationSeconds) || 360;
  if (!startedAt) return duration;

  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return duration;

  // Authoritative server timestamp synchronized with client offset
  const currentSyncedTimeMs = Date.now() + (offsetMs || 0);

  // Authoritative elapsed time since session start
  const elapsedMs = Math.max(0, currentSyncedTimeMs - startMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  // Authoritative remaining time: exactly duration at start, decrementing by elapsed seconds, stopping cleanly at 0
  const remaining = Math.max(0, duration - elapsedSeconds);

  return Math.min(duration, remaining);
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
  const elapsedMs = Math.max(0, currentSyncedTimeMs - startMs);
  return Math.floor(elapsedMs / 1000);
}
