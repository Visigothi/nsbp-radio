"use client"

import { create } from "zustand"
import { SpotifyTokens } from "./spotify-auth"

export interface PlayerState {
  paused: boolean
  shuffle: boolean
  position: number
  duration: number
  trackName: string
  artistName: string
  albumName: string
  albumArt: string
  trackUri: string
}

export interface QueueTrack {
  id: string
  uri: string
  name: string
  artists: string
  explicit: boolean
  albumArt: string
  duration: number  // ms
}

interface SpotifyStore {
  tokens: SpotifyTokens | null
  player: Spotify.Player | null
  deviceId: string | null
  playerState: PlayerState | null
  isReady: boolean
  queue: QueueTrack[]

  setTokens: (tokens: SpotifyTokens) => void
  clearTokens: () => void
  setPlayer: (player: Spotify.Player) => void
  setDeviceId: (id: string) => void
  setPlayerState: (state: PlayerState | null) => void
  setIsReady: (ready: boolean) => void
  setQueue: (queue: QueueTrack[]) => void
}

export const useSpotifyStore = create<SpotifyStore>((set) => ({
  tokens: null,
  player: null,
  deviceId: null,
  playerState: null,
  isReady: false,
  queue: [],

  setTokens: (tokens) => set({ tokens }),
  clearTokens: () => set({ tokens: null, player: null, deviceId: null, playerState: null, isReady: false, queue: [] }),
  setPlayer: (player) => set({ player }),
  setDeviceId: (deviceId) => set({ deviceId }),
  setPlayerState: (playerState) => set({ playerState }),
  setIsReady: (isReady) => set({ isReady }),
  setQueue: (queue) => set({ queue }),
}))
