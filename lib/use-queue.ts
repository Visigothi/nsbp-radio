"use client"

import { useEffect } from "react"
import { useSpotifyStore, QueueTrack } from "./spotify-store"

/**
 * Fetches the Spotify playback queue whenever the current track changes
 * and stores it in the Spotify store for display in the playlist panel.
 */
export function useQueue() {
  const trackUri = useSpotifyStore((s) => s.playerState?.trackUri)
  const tokens = useSpotifyStore((s) => s.tokens)
  const setQueue = useSpotifyStore((s) => s.setQueue)

  useEffect(() => {
    if (!tokens || !trackUri) return

    fetch("https://api.spotify.com/v1/me/player/queue", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Queue fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data) => {
        // Closing Time is managed separately in the Closing Time section —
        // exclude it from the generic Up Next list so it doesn't appear there
        // after being added to the Spotify user queue via Queue / Play Now.
        const CLOSING_TIME_URI = "spotify:track:1A5V1sxyCLpKJezp75tUXn"

        const tracks: QueueTrack[] = (data.queue ?? [])
          // Only show regular tracks, skip episodes/podcasts
          .filter((t: { type: string }) => t.type === "track")
          // Never show Closing Time in the Up Next list
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
        // Deduplicate consecutive entries with the same URI — these are loop
        // artifacts that appear when Spotify has no playlist context (e.g. after
        // playing a standalone track URI). Keep only the first occurrence.
        const deduped = tracks.filter(
          (t, i) => i === 0 || t.uri !== tracks[i - 1].uri
        )
        setQueue(deduped)
      })
      .catch((err) => console.error("[use-queue] Failed to fetch queue:", err))
  }, [trackUri, tokens, setQueue])
}
