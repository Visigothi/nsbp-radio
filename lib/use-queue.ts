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
        const tracks: QueueTrack[] = (data.queue ?? [])
          // Only show regular tracks, skip episodes/podcasts
          .filter((t: { type: string }) => t.type === "track")
          .map(
            (t: {
              id: string
              uri: string
              name: string
              artists: { name: string }[]
              explicit: boolean
              album: { images: { url: string }[] }
            }) => ({
              id: t.id,
              uri: t.uri,
              name: t.name,
              artists: t.artists.map((a) => a.name).join(", "),
              explicit: t.explicit,
              albumArt: t.album.images[2]?.url ?? t.album.images[0]?.url ?? "",
            })
          )
        setQueue(tracks)
      })
      .catch((err) => console.error("[use-queue] Failed to fetch queue:", err))
  }, [trackUri, tokens, setQueue])
}
