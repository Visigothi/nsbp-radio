/**
 * use-queue.ts — Fetches and maintains the Spotify "Up Next" queue
 *
 * Calls GET /v1/me/player/queue whenever the current track changes, and
 * also exposes refreshQueue() for on-demand refetches (used after playlist
 * switches and manual track selections, which can lag behind Spotify's state).
 *
 * Why staggered refreshes?
 *   Spotify's queue endpoint (/v1/me/player/queue) reflects the server's
 *   understanding of what's coming next, which lags behind SDK events.
 *   After switching playlists or jumping to a track, the queue endpoint
 *   may still return the old context for 1–3 seconds. Callers use
 *   refreshQueue() at 500ms, 1500ms, and 3000ms to catch the update
 *   at whichever point Spotify has processed it.
 *
 * Filtering:
 *   - Only items with type === "track" are included (excludes podcasts/ads)
 *   - "Closing Time" (hardcoded URI) is always filtered out — it has its own
 *     dedicated section and should not appear as a generic queue item even
 *     if it was recently added to the Spotify user queue via the Queue button
 *   - Consecutive duplicate URIs are removed (can appear when playing without
 *     a playlist context, where Spotify may repeat the same track in the queue)
 */

"use client"

import { useEffect, useCallback, useRef } from "react"
import { useSpotifyStore, QueueTrack } from "./spotify-store"

// Closing Time (Semisonic) — hardcoded track that has its own UI section
// and must not appear in the generic Up Next list
const CLOSING_TIME_URI = "spotify:track:1A5V1sxyCLpKJezp75tUXn"

export function useQueue() {
  const trackUri = useSpotifyStore((s) => s.playerState?.trackUri)
  const tokens = useSpotifyStore((s) => s.tokens)
  const setQueue = useSpotifyStore((s) => s.setQueue)

  // Stable ref so fetchQueue (a useCallback) always has the current token
  // without needing tokens in its dependency array (which would recreate it
  // on every token refresh, potentially causing duplicate fetches)
  const tokensRef = useRef(tokens)
  useEffect(() => { tokensRef.current = tokens }, [tokens])


  /**
   * Fetches the current Spotify queue and updates the store.
   * Stable reference via useCallback — safe to pass to setTimeout callers.
   *
   * Processing steps:
   *   1. Call /v1/me/player/queue
   *   2. Filter to track-type items only
   *   3. Remove Closing Time (it has its own UI card)
   *   4. Map to QueueTrack shape (id, uri, name, artists, explicit, duration, albumArt)
   *   5. Deduplicate consecutive identical URIs
   *   6. Store in Zustand (triggers re-render of Up Next list)
   */
  const fetchQueue = useCallback(async () => {
    const t = tokensRef.current
    if (!t) return

    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/queue", {
        headers: { Authorization: `Bearer ${t.accessToken}` },
      })
      if (!res.ok) throw new Error(`Queue fetch failed: ${res.status}`)
      const data = await res.json()

      // The currently playing track URI — used to filter it out of the queue.
      // When a track is played standalone (e.g. from search via PUT /play with uris[]),
      // Spotify may echo it back in the queue response. It shouldn't appear in
      // "Up Next" since it's already playing in the Now Playing section.
      const currentUri = data.currently_playing?.uri

      const tracks: QueueTrack[] = (data.queue ?? [])
        // Exclude podcast episodes, ads, and other non-track items
        .filter((t: { type: string }) => t.type === "track")
        // Exclude the currently playing track — it's already shown in Now Playing
        .filter((t: { uri: string }) => t.uri !== currentUri)
        // Exclude Closing Time — it has a dedicated hardcoded section
        .filter((t: { uri: string }) => t.uri !== CLOSING_TIME_URI)
        .map(
          (t: {
            id: string
            uri: string
            name: string
            artists: { name: string }[]
            explicit: boolean
            duration_ms: number
            album: { images: { url: string }[] }
          }) => ({
            id: t.id,
            uri: t.uri,
            name: t.name,
            artists: t.artists.map((a) => a.name).join(", "),
            explicit: t.explicit,
            duration: t.duration_ms,
            // Use the smallest thumbnail (index 2 = ~64px) for list rows.
            // Fall back to the largest if only one size is available.
            albumArt: t.album.images[2]?.url ?? t.album.images[0]?.url ?? "",
          })
        )

      // Remove consecutive duplicate URIs — can occur when playing without a
      // playlist context (Spotify sometimes mirrors the current track in the queue)
      const deduped = tracks.filter(
        (t, i) => i === 0 || t.uri !== tracks[i - 1].uri
      )
      setQueue(deduped)
    } catch (err) {
      console.error("[use-queue] Failed to fetch queue:", err)
    }
  }, [setQueue])

  /**
   * Automatically refetch the queue when the current track changes.
   * This covers the normal "next track starts" case.
   * For playlist switches and manual track jumps, callers use refreshQueue()
   * with staggered timeouts (500ms / 1500ms / 3000ms).
   */
  useEffect(() => {
    if (!tokens || !trackUri) return
    fetchQueue()
  }, [trackUri, tokens, fetchQueue])

  // Expose refreshQueue so SpotifyPanel can trigger on-demand refetches
  return { refreshQueue: fetchQueue }
}
