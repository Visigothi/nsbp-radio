/**
 * play-history.ts — localStorage-backed Spotify track play history
 *
 * Records each time a track is played and provides play count lookups
 * across multiple time windows (6 hours, today, 3 days, 7 days).
 *
 * Used by the UI to warn staff when a track has been overplayed:
 *   - 2× today  → amber badge
 *   - 3×+ today → red badge
 *   - 3×+ in 6 hours → red badge + blink animation
 *
 * Storage format:
 *   localStorage key: "nsbp_play_history"
 *   Value: JSON array of PlayRecord objects
 *   Records older than MAX_AGE_MS (7 days) are pruned on every write.
 *
 * Note: This data is stored per-browser. If staff use multiple devices,
 * play counts will not sync between them.
 */

const LS_KEY = "nsbp_play_history"
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

/**
 * A single play event stored in localStorage.
 * uri is used as the primary key for lookups; name/artists are stored
 * for potential future use (e.g. a play history report screen).
 */
export interface PlayRecord {
  uri: string       // Spotify URI e.g. "spotify:track:abc123"
  name: string      // Track title at time of play
  artists: string   // Artist name(s) at time of play
  timestamp: number // Unix timestamp in ms when playback started
}

/** Play counts across four time windows for a single track */
export interface PlayCounts {
  sixHours: number  // Plays in the past 6 hours — triggers blink-alert animation
  today: number     // Plays since midnight local time — shown in the player card
  threeDays: number // Plays in the past 72 hours
  week: number      // Plays in the past 7 days — shown in queue row tooltips
}

/**
 * Loads the play history array from localStorage.
 * Returns an empty array on server-side render or if JSON parsing fails.
 */
function loadRecords(): PlayRecord[] {
  if (typeof window === "undefined") return [] // SSR guard
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as PlayRecord[]) : []
  } catch {
    return [] // Corrupted data — start fresh
  }
}

/**
 * Saves the play history array to localStorage.
 * No-op during server-side render.
 */
function saveRecords(records: PlayRecord[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_KEY, JSON.stringify(records))
}

/**
 * Records a new play event for a track.
 * Also prunes records older than 7 days to keep storage size bounded.
 * Called by use-play-history.ts whenever playerState.trackUri changes
 * (and the player is not paused).
 */
export function recordPlay(uri: string, name: string, artists: string) {
  const cutoff = Date.now() - MAX_AGE_MS
  // Filter out stale records before adding the new one
  const fresh = loadRecords().filter((r) => r.timestamp > cutoff)
  fresh.push({ uri, name, artists, timestamp: Date.now() })
  saveRecords(fresh)
}

/**
 * Returns play counts for a specific track URI across all time windows.
 * "Today" is defined as since midnight in the user's local timezone —
 * not the last 24 hours — so counts reset cleanly at midnight.
 *
 * @param uri — Spotify URI to look up e.g. "spotify:track:abc123"
 */
export function getPlayCounts(uri: string): PlayCounts {
  const records = loadRecords()
  const now = Date.now()

  // Midnight of the current local day (not UTC)
  const midnightToday = new Date()
  midnightToday.setHours(0, 0, 0, 0)
  const todayCutoff = midnightToday.getTime()

  const sixHourCutoff = now - 6 * 60 * 60 * 1000
  const threeDayCutoff = now - 3 * 24 * 60 * 60 * 1000
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000

  // Filter to only this track's records
  const hits = records.filter((r) => r.uri === uri)

  return {
    sixHours:  hits.filter((r) => r.timestamp >= sixHourCutoff).length,
    today:     hits.filter((r) => r.timestamp >= todayCutoff).length,
    threeDays: hits.filter((r) => r.timestamp >= threeDayCutoff).length,
    week:      hits.filter((r) => r.timestamp >= weekCutoff).length,
  }
}

/**
 * Returns all play records from the past N days, sorted newest-first.
 * Not currently used in the UI but available for a future "play history"
 * screen or report export.
 *
 * @param days — How many days back to include (e.g. 1 = today only)
 */
export function getRecentHistory(days: number): PlayRecord[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return loadRecords()
    .filter((r) => r.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
}
