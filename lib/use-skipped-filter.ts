/**
 * use-skipped-filter.ts — Auto-skips tracks that staff have manually skipped
 *
 * Mirrors the pattern of use-explicit-filter.ts: watches every track change
 * and immediately calls skipToNext() if the incoming track is in the local
 * skip list (set by staff via the "Skip" button in the Up Next queue).
 *
 * Why this is needed:
 *   Spotify has no API to remove items from the user queue once they are added.
 *   The skip list is client-side only. When a skipped track naturally comes up
 *   in the playlist, Spotify will play it — this hook intercepts that and jumps
 *   to the next track before the staff or guests notice.
 *
 * Race condition guard:
 *   lastCheckedUri ref prevents duplicate skips when playerState fires multiple
 *   times for the same track (e.g. position updates, shuffle state changes).
 *
 * Mounted in AppShell so it runs continuously for the app's lifetime.
 */

"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { skipToNext } from "./spotify-api"
import { isSkipped } from "./skipped-tracks"

export function useSkippedFilter() {
  const playerState = useSpotifyStore((s) => s.playerState)
  const tokens = useSpotifyStore((s) => s.tokens)
  const deviceId = useSpotifyStore((s) => s.deviceId)

  // Prevents duplicate skip calls for the same track URI
  const lastCheckedUri = useRef<string | null>(null)

  useEffect(() => {
    // Only check when actively playing (not paused) and auth is present
    if (!playerState || playerState.paused || !tokens || !deviceId) return

    const uri = playerState.trackUri
    if (!uri || uri === lastCheckedUri.current) return
    if (!uri.startsWith("spotify:track:")) return

    // Mark as checked before the async action to prevent re-entry
    lastCheckedUri.current = uri

    if (isSkipped(uri)) {
      console.info(`[skipped filter] Auto-skipping manually skipped track: ${uri}`)
      skipToNext(tokens.accessToken, deviceId).catch((err) =>
        console.error("[skipped filter] Error skipping track:", err)
      )
    }
  }, [playerState, tokens, deviceId])
}
