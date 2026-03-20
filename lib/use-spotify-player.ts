"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { refreshAccessToken } from "./spotify-auth"

export function useSpotifyPlayer() {
  const { tokens, setPlayer, setDeviceId, setPlayerState, setIsReady, setTokens } =
    useSpotifyStore()
  const playerRef = useRef<Spotify.Player | null>(null)

  useEffect(() => {
    if (!tokens) return

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: "NSBP Radio",
        getOAuthToken: async (cb) => {
          let current = tokens
          if (Date.now() > current.expiresAt - 60_000) {
            try {
              current = await refreshAccessToken(current.refreshToken)
              setTokens(current)
            } catch {
              console.error("Failed to refresh Spotify token")
            }
          }
          cb(current.accessToken)
        },
        volume: 1.0,
      })

      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id)
        setIsReady(true)
      })

      player.addListener("not_ready", () => {
        setIsReady(false)
      })

      player.addListener("player_state_changed", (state) => {
        if (!state) {
          setPlayerState(null)
          return
        }
        const track = state.track_window.current_track
        setPlayerState({
          paused: state.paused,
          position: state.position,
          duration: state.duration,
          trackName: track.name,
          artistName: track.artists.map((a) => a.name).join(", "),
          albumName: track.album.name,
          albumArt: track.album.images[0]?.url ?? "",
          trackUri: track.uri,
        })
      })

      player.addListener("initialization_error", ({ message }) =>
        console.error("Spotify init error:", message)
      )
      player.addListener("authentication_error", ({ message }) =>
        console.error("Spotify auth error:", message)
      )
      player.addListener("account_error", ({ message }) =>
        console.error("Spotify account error:", message)
      )

      player.connect()
      playerRef.current = player
      setPlayer(player)
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer
      const script = document.createElement("script")
      script.src = "https://sdk.scdn.co/spotify-player.js"
      script.async = true
      document.body.appendChild(script)
    }

    return () => {
      playerRef.current?.disconnect()
    }
  }, [tokens]) // eslint-disable-line react-hooks/exhaustive-deps
}
