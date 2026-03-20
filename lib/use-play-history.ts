"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { recordPlay } from "./play-history"

/**
 * Records a play event whenever the current Spotify track changes.
 * Skips recording if the track is paused (e.g. resumed from same position).
 */
export function usePlayHistory() {
  const playerState = useSpotifyStore((s) => s.playerState)
  const lastRecordedUri = useRef<string | null>(null)

  useEffect(() => {
    if (!playerState || playerState.paused) return
    if (!playerState.trackUri) return
    if (playerState.trackUri === lastRecordedUri.current) return

    lastRecordedUri.current = playerState.trackUri
    recordPlay(playerState.trackUri, playerState.trackName, playerState.artistName)
  }, [playerState])
}
