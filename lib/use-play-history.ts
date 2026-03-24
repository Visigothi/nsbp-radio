/**
 * use-play-history.ts — Records Spotify track plays into localStorage
 *
 * Watches the current playerState from the Zustand store and calls
 * recordPlay() whenever the track URI changes and the player is not paused.
 *
 * The "not paused" guard prevents double-counting when a track is resumed
 * from a paused state — the trackUri hasn't changed, but playerState fires
 * again when unpausing.
 *
 * The lastRecordedUri ref ensures we record each track only once per play,
 * even if playerState fires multiple times for the same URI (which the SDK
 * can do, for example when the position updates or shuffle changes).
 *
 * Play counts are displayed in:
 *   - SpotifyPanel: PlayCountLine below artist name on the now-playing card
 *   - SpotifyPanel: PlayCountBadge pill on each Up Next queue row
 *
 * See play-history.ts for the storage format and count retrieval functions.
 */

"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { recordPlay } from "./play-history"

export function usePlayHistory() {
  const playerState = useSpotifyStore((s) => s.playerState)

  // Tracks which URI we most recently recorded so we don't log the same
  // track twice when playerState fires repeatedly for the same track
  const lastRecordedUri = useRef<string | null>(null)

  /**
   * Delayed recording timer — prevents inflated play counts from auto-skip cascades.
   *
   * Problem: when the skip filter auto-skips overplayed tracks, Spotify briefly
   * plays each track for 1-2 seconds before skipping to the next. If we record
   * a play immediately on track change, these brief plays inflate the count,
   * pushing tracks that were just under the threshold over it. This creates a
   * runaway cascade where every track appears overplayed.
   *
   * Solution: wait 5 seconds before recording a play. If the track changes
   * within that window (because it was auto-skipped), the timer is cancelled
   * and no play is recorded. Only tracks that actually play for 5+ seconds
   * get counted. 5 seconds is long enough to avoid counting auto-skipped
   * tracks but short enough that a legitimately played track is always recorded.
   */
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Clear any pending record timer when track changes or playback stops
    if (recordTimer.current) {
      clearTimeout(recordTimer.current)
      recordTimer.current = null
    }

    // Don't record if there's nothing playing or if playback is paused
    if (!playerState || playerState.paused) return
    if (!playerState.trackUri) return

    // Don't record if this is the same track we just recorded
    if (playerState.trackUri === lastRecordedUri.current) return

    // Capture current values for the closure
    const uri = playerState.trackUri
    const name = playerState.trackName
    const artists = playerState.artistName

    // Delay recording by 5 seconds — if the track is auto-skipped before
    // then, the timer is cancelled by the cleanup above and no play is logged
    recordTimer.current = setTimeout(() => {
      lastRecordedUri.current = uri
      recordPlay(uri, name, artists)
    }, 5000)

    // Cleanup on unmount
    return () => {
      if (recordTimer.current) {
        clearTimeout(recordTimer.current)
        recordTimer.current = null
      }
    }
  }, [playerState])
}
