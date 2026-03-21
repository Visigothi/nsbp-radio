/**
 * use-explicit-filter.ts — Hard-blocks explicit Spotify tracks
 *
 * This hook watches every track change and immediately skips any track that
 * Spotify has flagged as explicit. The skip happens silently — no UI feedback
 * is shown to the user (just a console warning for debugging).
 *
 * Why check via the API instead of the SDK's track data?
 *   The Spotify Web Playback SDK's player_state_changed payload does not
 *   include the "explicit" field on track objects. We must call the REST API
 *   (GET /v1/tracks/{id}) to retrieve the full track metadata including the
 *   explicit flag.
 *
 * Race condition guard:
 *   The lastCheckedUri ref ensures we only fire one API call per unique track
 *   URI, even if playerState fires multiple times for the same track (which
 *   the SDK does when position/shuffle/pause state changes without a track
 *   change). Without this guard, we would make redundant API calls and could
 *   trigger multiple skips.
 *
 * This hook is mounted in AppShell so it runs regardless of which panel is
 * visible — the filter is always active while the app is open.
 *
 * Note: Explicit tracks ARE still shown in the Up Next queue list with a
 * strikethrough and "E" badge, so staff can see what's coming and understand
 * why certain tracks are being skipped.
 */

"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { skipToNext } from "./spotify-api"

export function useExplicitFilter() {
  const playerState = useSpotifyStore((s) => s.playerState)
  const tokens = useSpotifyStore((s) => s.tokens)
  const deviceId = useSpotifyStore((s) => s.deviceId)

  // Prevents duplicate API calls for the same track URI
  const lastCheckedUri = useRef<string | null>(null)

  useEffect(() => {
    // Only check when actively playing (not paused, and all auth is present)
    if (!playerState || playerState.paused || !tokens || !deviceId) return

    const uri = playerState.trackUri
    if (!uri || uri === lastCheckedUri.current) return

    // Only check regular tracks — skip ads, podcasts, local files, etc.
    if (!uri.startsWith("spotify:track:")) return

    // Mark as checked immediately to prevent re-checking on subsequent
    // playerState updates for the same track
    lastCheckedUri.current = uri
    const trackId = uri.split(":")[2]
    if (!trackId) return

    fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((res) => res.json())
      .then((track) => {
        if (track.explicit === true) {
          console.warn(`[explicit filter] Skipping explicit track: "${track.name}" by ${track.artists?.map((a: { name: string }) => a.name).join(", ")}`)
          skipToNext(tokens.accessToken, deviceId)
        }
      })
      .catch((err) => console.error("[explicit filter] Error checking track:", err))
  }, [playerState, tokens, deviceId])
}
