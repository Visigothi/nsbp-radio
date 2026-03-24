/**
 * skipped-tracks.ts — localStorage-backed set of manually skipped track URIs
 *
 * Staff can mark any Up Next track as "skipped" so it won't play during the
 * current day. Skipped tracks are visually dimmed in the queue (same treatment
 * as explicit tracks) and auto-skipped by useSkippedFilter when they come up
 * in playback.
 *
 * Reset schedule:
 *   The skip list clears automatically at 06:00 AM every day. This means
 *   staff can suppress an overplayed track for the rest of the current shift
 *   without having to manually restore it the next day.
 *
 * Storage format:
 *   "nsbp_skipped_uris"      — JSON array of Spotify track URI strings
 *   "nsbp_skipped_cleared_at" — Unix timestamp (ms) of the last reset
 *
 * Note: Like play history, this is per-browser. Multiple devices do not sync.
 */

const LS_URIS_KEY = "nsbp_skipped_uris"
const LS_DATE_KEY = "nsbp_skipped_cleared_at"

/**
 * Returns the Unix timestamp (ms) of the most recent 06:00 AM in local time.
 * Used to determine whether the skip list is stale and needs clearing.
 *
 * Examples:
 *   - If it's currently 08:00 AM → returns today's 06:00 AM
 *   - If it's currently 04:00 AM → returns yesterday's 06:00 AM
 */
function getMostRecent6AM(): number {
  const now = new Date()
  const sixAM = new Date(now)
  sixAM.setHours(6, 0, 0, 0)
  // If we haven't reached 6AM yet today, step back to yesterday's 6AM
  if (now < sixAM) {
    sixAM.setDate(sixAM.getDate() - 1)
  }
  return sixAM.getTime()
}

/**
 * Loads the skipped URI set from localStorage.
 * Automatically clears and resets the list if the last reset was before
 * the most recent 06:00 AM (i.e., the daily reset has passed).
 * Safe to call during SSR — returns an empty Set when window is unavailable.
 */
export function getSkippedUris(): Set<string> {
  if (typeof window === "undefined") return new Set()

  // Check if the daily 6AM reset has passed since the list was last cleared
  const lastCleared = parseInt(localStorage.getItem(LS_DATE_KEY) ?? "0", 10)
  if (lastCleared < getMostRecent6AM()) {
    // Reset time has passed — wipe the skip list and record the new clear time
    localStorage.removeItem(LS_URIS_KEY)
    localStorage.setItem(LS_DATE_KEY, String(Date.now()))
    return new Set()
  }

  try {
    const raw = localStorage.getItem(LS_URIS_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set() // Corrupted data — start fresh
  }
}

/**
 * Persists the given URI set to localStorage.
 * Records the current timestamp as the last-cleared time if this is the
 * first write of the session (i.e., no existing timestamp).
 */
function saveSkippedUris(uris: Set<string>) {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_URIS_KEY, JSON.stringify(Array.from(uris)))
  // Record cleared-at timestamp on first write so future resets work correctly
  if (!localStorage.getItem(LS_DATE_KEY)) {
    localStorage.setItem(LS_DATE_KEY, String(Date.now()))
  }
}

/**
 * Marks a track URI as skipped.
 * The track will be auto-skipped during playback until the 6AM reset.
 */
export function skipTrack(uri: string) {
  const uris = getSkippedUris()
  uris.add(uri)
  saveSkippedUris(uris)
}

/**
 * Removes the skip mark from a track URI.
 * The track will play normally again in the Up Next queue.
 */
export function unskipTrack(uri: string) {
  const uris = getSkippedUris()
  uris.delete(uri)
  saveSkippedUris(uris)
}

/**
 * Returns true if the given URI is currently in the skip list.
 * Used by useSkippedFilter to decide whether to auto-skip a track.
 */
export function isSkipped(uri: string): boolean {
  return getSkippedUris().has(uri)
}
