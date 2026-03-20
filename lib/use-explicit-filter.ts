"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { skipToNext } from "./spotify-api"

/**
 * Hard-blocks any Spotify track flagged as explicit.
 * When a new track starts, fetches its metadata from the Spotify API and
 * immediately skips it if explicit === true.
 */
export function useExplicitFilter() {
  const playerState = useSpotifyStore((s) => s.playerState)
  const tokens = useSpotifyStore((s) => s.tokens)
  const deviceId = useSpotifyStore((s) => s.deviceId)

  // Track the last URI we checked so we don't fire multiple times per track
  const lastCheckedUri = useRef<string | null>(null)

  useEffect(() => {
    if (!playerState || playerState.paused || !tokens || !deviceId) return

    const uri = playerState.trackUri
    if (!uri || uri === lastCheckedUri.current) return

    // Only handle regular tracks (not episodes, ads, etc.)
    if (!uri.startsWith("spotify:track:")) return

    lastCheckedUri.current = uri
    const trackId = uri.split(":")[2]
    if (!trackId) return

    fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((res) => res.json())
      .then((track) => {
        if (track.explicit === true) {
          console.warn(`[explicit filter] Skipping explicit track: "${track.name}"`)
          skipToNext(tokens.accessToken, deviceId)
        }
      })
      .catch((err) => console.error("[explicit filter] Error checking track:", err))
  }, [playerState, tokens, deviceId])
}
