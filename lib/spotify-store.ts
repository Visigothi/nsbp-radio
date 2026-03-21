/**
 * spotify-store.ts — Zustand global state store for all Spotify-related data
 *
 * This is the single source of truth for the Spotify layer of the app.
 * All components read from here rather than managing their own Spotify state.
 *
 * State lifecycle:
 *   - tokens:       Set by /spotify-callback after OAuth, cleared on disconnect
 *   - player:       Set by use-spotify-player once the SDK initialises
 *   - deviceId:     Set by the SDK's "ready" event; required for all REST calls
 *   - playerState:  Updated on every "player_state_changed" SDK event
 *   - isReady:      True once the device is registered and ready to accept playback
 *   - queue:        Updated by use-queue.ts on each track change
 *   - spotifyUser:  Fetched from /v1/me once tokens are available
 *
 * Note: This store is in-memory only. Tokens are NOT persisted to localStorage,
 * so users must re-connect Spotify on every page reload.
 */

"use client"

import { create } from "zustand"
import { SpotifyTokens } from "./spotify-auth"

/**
 * Snapshot of the currently-playing Spotify track.
 * Populated from the Spotify SDK's player_state_changed event payload.
 */
export interface PlayerState {
  paused: boolean      // Whether playback is currently paused
  shuffle: boolean     // Whether shuffle mode is active
  position: number     // Current playback position in ms (stale — use getCurrentState() for live)
  duration: number     // Total track duration in ms
  trackName: string    // Display name of the current track
  artistName: string   // Comma-separated list of artist names
  albumName: string    // Album name (used as alt text for album art)
  albumArt: string     // URL of the album art image (from i.scdn.co)
  trackUri: string     // Spotify URI e.g. "spotify:track:abc123" — used as a unique track identifier
}

/** Connected Spotify account identity, fetched from /v1/me */
export interface SpotifyUser {
  displayName: string  // Spotify display name (falls back to Spotify username/id if not set)
  email: string        // Email address on the Spotify account
}

/**
 * A single track in the "Up Next" queue.
 * Populated by use-queue.ts from the /v1/me/player/queue endpoint.
 */
export interface QueueTrack {
  id: string        // Spotify track ID (without the "spotify:track:" prefix)
  uri: string       // Full Spotify URI e.g. "spotify:track:abc123"
  name: string      // Track title
  artists: string   // Comma-separated artist names
  explicit: boolean // Whether Spotify has flagged this track as explicit
  albumArt: string  // URL of the smallest album art thumbnail (for list rows)
  duration: number  // Track length in ms — displayed as M:SS in the UI
}

/** Shape of the full Zustand store including all actions */
interface SpotifyStore {
  // ── State ────────────────────────────────────────────────────────────────
  tokens: SpotifyTokens | null         // OAuth tokens; null = not connected
  spotifyUser: SpotifyUser | null      // Account info; null until /v1/me is fetched
  player: Spotify.Player | null        // Spotify Web Playback SDK player instance
  deviceId: string | null              // SDK device ID registered with Spotify
  playerState: PlayerState | null      // Current track state; null when nothing loaded
  isReady: boolean                     // True when the SDK device is ready to play
  queue: QueueTrack[]                  // Upcoming tracks from Spotify's queue endpoint

  // ── Actions ───────────────────────────────────────────────────────────────
  setTokens: (tokens: SpotifyTokens) => void
  /**
   * Resets the entire Spotify state — used by Disconnect and Switch Account.
   * Clears tokens, player instance, device, state, and queue in one atomic update.
   */
  clearTokens: () => void
  setSpotifyUser: (user: SpotifyUser | null) => void
  setPlayer: (player: Spotify.Player) => void
  setDeviceId: (id: string) => void
  setPlayerState: (state: PlayerState | null) => void
  setIsReady: (ready: boolean) => void
  setQueue: (queue: QueueTrack[]) => void
}

export const useSpotifyStore = create<SpotifyStore>((set) => ({
  // Initial state — everything null/empty until Spotify connects
  tokens: null,
  spotifyUser: null,
  player: null,
  deviceId: null,
  playerState: null,
  isReady: false,
  queue: [],

  setTokens: (tokens) => set({ tokens }),
  // Full reset — used when disconnecting or switching Spotify accounts
  clearTokens: () => set({
    tokens: null,
    spotifyUser: null,
    player: null,
    deviceId: null,
    playerState: null,
    isReady: false,
    queue: [],
  }),
  setSpotifyUser: (spotifyUser) => set({ spotifyUser }),
  setPlayer: (player) => set({ player }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setPlayerState: (playerState) => set({ playerState }),
  setIsReady: (isReady) => set({ isReady }),
  setQueue: (queue) => set({ queue }),
}))
