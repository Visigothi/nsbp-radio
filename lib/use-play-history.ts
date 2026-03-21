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

  useEffect(() => {
    // Don't record if there's nothing playing or if playback is paused
    if (!playerState || playerState.paused) return
    if (!playerState.trackUri) return

    // Don't record if this is the same track we just recorded
    if (playerState.trackUri === lastRecordedUri.current) return

    // New track is playing — record it
    lastRecordedUri.current = playerState.trackUri
    recordPlay(playerState.trackUri, playerState.trackName, playerState.artistName)
  }, [playerState])
}
