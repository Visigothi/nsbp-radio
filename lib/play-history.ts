/**
 * Tracks Spotify play history in localStorage.
 * Stores the last 7 days of plays and exposes per-track counts.
 */

const LS_KEY = "nsbp_play_history"
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface PlayRecord {
  uri: string
  name: string
  artists: string
  timestamp: number
}

export interface PlayCounts {
  today: number
  threeDays: number
  week: number
}

function loadRecords(): PlayRecord[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as PlayRecord[]) : []
  } catch {
    return []
  }
}

function saveRecords(records: PlayRecord[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_KEY, JSON.stringify(records))
}

/** Record that a track started playing. Prunes entries older than 7 days. */
export function recordPlay(uri: string, name: string, artists: string) {
  const cutoff = Date.now() - MAX_AGE_MS
  const fresh = loadRecords().filter((r) => r.timestamp > cutoff)
  fresh.push({ uri, name, artists, timestamp: Date.now() })
  saveRecords(fresh)
}

/** Return today/3-day/week play counts for a given track URI. */
export function getPlayCounts(uri: string): PlayCounts {
  const records = loadRecords()
  const now = Date.now()

  // "Today" = since midnight local time
  const midnightToday = new Date()
  midnightToday.setHours(0, 0, 0, 0)
  const todayCutoff = midnightToday.getTime()

  const threeDayCutoff = now - 3 * 24 * 60 * 60 * 1000
  const weekCutoff = now - 7 * 24 * 60 * 60 * 1000

  const hits = records.filter((r) => r.uri === uri)

  return {
    today: hits.filter((r) => r.timestamp >= todayCutoff).length,
    threeDays: hits.filter((r) => r.timestamp >= threeDayCutoff).length,
    week: hits.filter((r) => r.timestamp >= weekCutoff).length,
  }
}

/** Return all records within the past N days, newest first. */
export function getRecentHistory(days: number): PlayRecord[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return loadRecords()
    .filter((r) => r.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp)
}
