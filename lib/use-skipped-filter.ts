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
import { useCommercialStore } from "./commercial-store"
import { skipToNext } from "./spotify-api"
import { isSkipped } from "./skipped-tracks"
import { getPlayCounts } from "./play-history"

/**
 * useSkippedFilter — Auto-skips tracks that should not play, for two reasons:
 *
 * 1. Manual skip: staff pressed the Skip button on a queue row. The track URI
 *    is in the localStorage skip list (skipped-tracks.ts).
 *
 * 2. Auto-skip by play count: the Settings modal has "Skip tracks played more
 *    than N times today" enabled. If the current track's today-play-count meets
 *    or exceeds the threshold, it is skipped automatically.
 *
 * Both checks use the same skipToNext() call and the same lastCheckedUri guard
 * to prevent duplicate skips on repeated playerState events for the same track.
 *
 * Mounted in AppShell so it runs continuously for the app's lifetime.
 */
export function useSkippedFilter() {
  const playerState = useSpotifyStore((s) => s.playerState)
  const tokens = useSpotifyStore((s) => s.tokens)
  const deviceId = useSpotifyStore((s) => s.deviceId)
  const autoSkipEnabled = useCommercialStore((s) => s.autoSkipEnabled)
  const autoSkipThreshold = useCommercialStore((s) => s.autoSkipThreshold)

  // Prevents duplicate skip calls for the same track URI
  const lastCheckedUri = useRef<string | null>(null)

  /**
   * Cooldown guard — prevents rapid-fire skip cascading.
   *
   * Problem: when skipToNext() fires, Spotify advances to the next track and
   * briefly plays it (1-2 seconds) before the new playerState event arrives.
   * If that next track is ALSO overplayed/skipped, this hook would immediately
   * skip again, creating a rapid chain through every overplayed track in the
   * queue. The user sees tracks flickering by with no way to pause.
   *
   * Solution: after any skip, set a 2-second cooldown window during which no
   * further skips are allowed. This gives the player time to settle on a
   * playable track and prevents the cascade effect.
   */
  const skipCooldownUntil = useRef<number>(0)

  useEffect(() => {
    // Only check when actively playing (not paused) and auth is present
    if (!playerState || playerState.paused || !tokens || !deviceId) return

    const uri = playerState.trackUri
    if (!uri || uri === lastCheckedUri.current) return
    if (!uri.startsWith("spotify:track:")) return

    // Respect the cooldown window after a recent skip
    if (Date.now() < skipCooldownUntil.current) return

    // Mark as checked before the async action to prevent re-entry
    lastCheckedUri.current = uri

    // Determine whether this track should be skipped (either reason)
    const manuallySkipped = isSkipped(uri)
    const overplayed = autoSkipEnabled && getPlayCounts(uri).today >= autoSkipThreshold

    if (!manuallySkipped && !overplayed) return

    const reason = manuallySkipped
      ? "manually skipped"
      : `overplayed (${getPlayCounts(uri).today}× today, threshold: ${autoSkipThreshold})`
    console.info(`[skipped filter] Skipping track — ${reason}: ${uri}`)

    // Set a 2-second cooldown before the next skip can fire.
    // This prevents cascading skips when multiple consecutive tracks
    // are overplayed — each skip needs time for the player to settle.
    skipCooldownUntil.current = Date.now() + 2000

    skipToNext(tokens.accessToken, deviceId).catch((err) =>
      console.error("[skipped filter] Error skipping track:", err)
    )
  }, [playerState, tokens, deviceId, autoSkipEnabled, autoSkipThreshold])
}
