/**
 * use-spotify-player.ts — Spotify Web Playback SDK initialisation hook
 *
 * Loads the Spotify Web Playback SDK script, creates a Player instance,
 * wires up all SDK event listeners, and stores the player + device ID
 * in the Zustand spotify-store.
 *
 * This hook must be called once at the top level of the app (currently in
 * SpotifyPanel.tsx). It is a no-op until tokens are available in the store.
 *
 * SDK lifecycle:
 *   1. Script tag is injected into <body> (or detected if already present)
 *   2. window.onSpotifyWebPlaybackSDKReady callback fires
 *   3. new Spotify.Player() is created with a getOAuthToken callback
 *   4. player.connect() registers this browser tab as a Spotify device
 *   5. "ready" event fires with a device_id — stored in the Zustand store
 *   6. transferPlayback() is called (in SpotifyPanel) to make this the active device
 *   7. "player_state_changed" events fire on every track change / pause / etc.
 *
 * Token refresh:
 *   The SDK calls getOAuthToken() whenever it needs a valid access token.
 *   We check expiry (with a 60s buffer) and call refreshAccessToken() if needed,
 *   then update the store with the fresh tokens before passing to the SDK.
 *
 * Cleanup:
 *   When the component unmounts or tokens are cleared, player.disconnect()
 *   is called to unregister the device from Spotify.
 *
 * Requirements:
 *   - Spotify Premium account (free accounts cannot use the Web Playback SDK)
 *   - The Spotify app must have the user added as a Development User (or be
 *     in Extended Quota Mode) in the Spotify Developer Dashboard
 */

"use client"

import { useEffect, useRef } from "react"
import { useSpotifyStore } from "./spotify-store"
import { refreshAccessToken } from "./spotify-auth"

export function useSpotifyPlayer() {
  const { tokens, setPlayer, setDeviceId, setPlayerState, setIsReady, setTokens } =
    useSpotifyStore()

  // Keep a ref to the current player so the cleanup function can disconnect it
  // even if the component re-renders between mount and unmount
  const playerRef = useRef<Spotify.Player | null>(null)

  useEffect(() => {
    // Don't initialise until we have Spotify OAuth tokens
    if (!tokens) return

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: "NSBP Radio", // This name appears in Spotify's "Connect to a device" list
        /**
         * getOAuthToken is called by the SDK whenever it needs a valid access token.
         * We check our stored expiry and refresh proactively to avoid playback interruptions.
         * The cb(token) callback must be called with the token for the SDK to proceed.
         */
        getOAuthToken: async (cb) => {
          let current = tokens
          if (Date.now() > current.expiresAt - 60_000) {
            try {
              current = await refreshAccessToken(current.refreshToken)
              setTokens(current) // Update the store with fresh tokens
            } catch {
              console.error("Failed to refresh Spotify token")
            }
          }
          cb(current.accessToken)
        },
        volume: 1.0, // Always start at full volume
      })

      /**
       * "ready" fires when the player has registered with Spotify and received
       * a device_id. This ID is required for all REST API calls that target
       * this specific player (play, queue, seek, shuffle, etc.).
       */
      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id)
        setIsReady(true)
      })

      /**
       * "not_ready" fires when the player loses its connection to Spotify
       * (e.g. network interruption). The device_id is no longer valid.
       */
      player.addListener("not_ready", () => {
        setIsReady(false)
      })

      /**
       * "player_state_changed" fires on every playback state change:
       * track changes, play/pause, seek, shuffle toggle, etc.
       *
       * Note: `state.position` in this event is a snapshot — it does NOT
       * update continuously. For a live position (e.g. in the announcement
       * engine's queue trigger), call player.getCurrentState() instead.
       */
      player.addListener("player_state_changed", (state) => {
        if (!state) {
          // null state means the player has no active context (nothing queued)
          setPlayerState(null)
          return
        }
        const track = state.track_window.current_track
        setPlayerState({
          paused: state.paused,
          shuffle: state.shuffle,
          position: state.position,
          duration: state.duration,
          trackName: track.name,
          artistName: track.artists.map((a) => a.name).join(", "),
          albumName: track.album.name,
          albumArt: track.album.images[0]?.url ?? "",
          trackUri: track.uri,
        })
      })

      // Log SDK errors — these appear in the browser console, not the UI
      player.addListener("initialization_error", ({ message }) =>
        console.error("Spotify init error:", message)
      )
      player.addListener("authentication_error", ({ message }) =>
        console.error("Spotify auth error:", message)
      )
      // account_error typically means the account is not Premium
      player.addListener("account_error", ({ message }) =>
        console.error("Spotify account error (Premium required?):", message)
      )

      player.connect() // Registers this tab as a Spotify device
      playerRef.current = player
      setPlayer(player)
    }

    // The SDK script may already be loaded (e.g. on hot reload in development)
    if (window.Spotify) {
      initPlayer()
    } else {
      // Set the callback that the SDK script calls once it has loaded
      window.onSpotifyWebPlaybackSDKReady = initPlayer
      // Dynamically inject the SDK script tag
      const script = document.createElement("script")
      script.src = "https://sdk.scdn.co/spotify-player.js"
      script.async = true
      document.body.appendChild(script)
    }

    return () => {
      // Clean up when tokens change (e.g. disconnect / switch account)
      playerRef.current?.disconnect()
    }
  }, [tokens]) // eslint-disable-line react-hooks/exhaustive-deps
  // Note: The deps array intentionally omits the setter callbacks — they are
  // stable Zustand setters and including them would cause unnecessary re-runs.
}
