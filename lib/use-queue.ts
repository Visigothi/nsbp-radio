"use client"

import { useEffect, useCallback, useRef } from "react"
import { useSpotifyStore, QueueTrack } from "./spotify-store"

const CLOSING_TIME_URI = "spotify:track:1A5V1sxyCLpKJezp75tUXn"

/**
 * Fetches the Spotify playback queue whenever the current track changes
 * and stores it in the Spotify store for display in the playlist panel.
 * Also exposes refreshQueue() for on-demand refetches (e.g. after playlist switch).
 */
export function useQueue() {
  const trackUri = useSpotifyStore((s) => s.playerState?.trackUri)
  const tokens = useSpotifyStore((s) => s.tokens)
  const setQueue = useSpotifyStore((s) => s.setQueue)

  // Keep a stable ref to tokens so refreshQueue closure is always fresh
  const tokensRef = useRef(tokens)
  useEffect(() => { tokensRef.current = tokens }, [tokens])

  const fetchQueue = useCallback(async () => {
    const t = tokensRef.current
    if (!t) return
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player/queue", {
        headers: { Authorization: `Bearer ${t.accessToken}` },
      })
      if (!res.ok) throw new Error(`Queue fetch failed: ${res.status}`)
      const data = await res.json()

      const tracks: QueueTrack[] = (data.queue ?? [])
        .filter((t: { type: string }) => t.type === "track")
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
            albumArt: t.album.images[2]?.url ?? t.album.images[0]?.url ?? "",
          })
        )

      // Remove consecutive duplicate URIs (loop artifacts from context-less playback)
      const deduped = tracks.filter(
        (t, i) => i === 0 || t.uri !== tracks[i - 1].uri
      )
      setQueue(deduped)
    } catch (err) {
      console.error("[use-queue] Failed to fetch queue:", err)
    }
  }, [setQueue])

  // Refetch automatically on track change
  useEffect(() => {
    if (!tokens || !trackUri) return
    fetchQueue()
  }, [trackUri, tokens, fetchQueue])

  return { refreshQueue: fetchQueue }
}
