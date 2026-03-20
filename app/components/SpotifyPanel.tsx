"use client"

import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { useSpotifyStore } from "@/lib/spotify-store"
import { useSpotifyPlayer } from "@/lib/use-spotify-player"
import { useQueue } from "@/lib/use-queue"
import { initiateSpotifyAuth } from "@/lib/spotify-auth"
import {
  fetchUserPlaylists,
  playPlaylist,
  transferPlayback,
  SpotifyPlaylist,
} from "@/lib/spotify-api"

export default function SpotifyPanel() {
  useSpotifyPlayer()
  useQueue()

  const { tokens, player, deviceId, playerState, isReady, queue } = useSpotifyStore()
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null)
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // Transfer playback to this device once ready
  useEffect(() => {
    if (isReady && deviceId && tokens) {
      transferPlayback(tokens.accessToken, deviceId).catch(console.error)
    }
  }, [isReady, deviceId, tokens])

  // Fetch playlists once connected
  useEffect(() => {
    if (!tokens) return
    setLoadingPlaylists(true)
    fetchUserPlaylists(tokens.accessToken)
      .then(setPlaylists)
      .catch(console.error)
      .finally(() => setLoadingPlaylists(false))
  }, [tokens])

  // Live progress bar
  useEffect(() => {
    if (!playerState) return
    setProgress(playerState.position)

    if (progressInterval.current) clearInterval(progressInterval.current)
    if (!playerState.paused) {
      progressInterval.current = setInterval(() => {
        setProgress((p) => Math.min(p + 500, playerState.duration))
      }, 500)
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
  }, [playerState])

  const handlePlayPlaylist = async (playlist: SpotifyPlaylist) => {
    if (!tokens || !deviceId) return
    setSelectedPlaylist(playlist)
    await playPlaylist(tokens.accessToken, deviceId, `spotify:playlist:${playlist.id}`)
  }

  const handlePlayFromQueue = async (trackUri: string) => {
    if (!player || !tokens || !deviceId) return

    // Fade out over 1.5s (30 steps × 50ms)
    const STEPS = 30
    const DELAY = 1500 / STEPS
    for (let i = STEPS; i >= 0; i--) {
      player.setVolume(i / STEPS)
      await new Promise((r) => setTimeout(r, DELAY))
    }

    // Play from that track, preserving playlist context if available
    const body = selectedPlaylist
      ? {
          context_uri: `spotify:playlist:${selectedPlaylist.id}`,
          offset: { uri: trackUri },
          position_ms: 0,
        }
      : { uris: [trackUri] }

    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    // Fade back in
    for (let i = 0; i <= STEPS; i++) {
      player.setVolume(i / STEPS)
      await new Promise((r) => setTimeout(r, DELAY))
    }
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }

  if (!tokens) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
        <div className="text-center space-y-2">
          <p className="text-zinc-300 font-medium">Connect Spotify</p>
          <p className="text-zinc-500 text-sm">
            Sign in with the NSBP Spotify Premium account to start playing music.
          </p>
        </div>
        <button
          onClick={initiateSpotifyAuth}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-semibold py-2.5 px-6 rounded-full transition-colors"
        >
          <SpotifyIcon />
          Connect Spotify
        </button>
      </div>
    )
  }

  const progressPct = playerState ? (progress / playerState.duration) * 100 : 0

  return (
    <div className="flex flex-col gap-4">
      {/* Playlist selector */}
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">
          Playlist
        </label>
        {loadingPlaylists ? (
          <p className="text-zinc-500 text-sm">Loading playlists...</p>
        ) : (
          <select
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            value={selectedPlaylist?.id ?? ""}
            onChange={(e) => {
              const playlist = playlists.find((p) => p.id === e.target.value)
              if (playlist) handlePlayPlaylist(playlist)
            }}
          >
            <option value="" disabled>
              Select a playlist...
            </option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Now playing card */}
      {playerState ? (
        <div className="flex flex-col items-center gap-4">
          {playerState.albumArt && (
            <div className="relative w-40 h-40 rounded-lg overflow-hidden shadow-2xl">
              <Image
                src={playerState.albumArt}
                alt={playerState.albumName}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="text-center">
            <p className="text-white font-semibold text-lg leading-tight">
              {playerState.trackName}
            </p>
            <p className="text-zinc-400 text-sm mt-0.5">{playerState.artistName}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full space-y-1">
            <div className="w-full bg-zinc-700 rounded-full h-1">
              <div
                className="bg-white rounded-full h-1 transition-none"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>{formatTime(progress)}</span>
              <span>{playerState.duration ? formatTime(playerState.duration) : "--:--"}</span>
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => player?.previousTrack()}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Previous"
            >
              <PrevIcon />
            </button>
            <button
              onClick={() => player?.togglePlay()}
              className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
              title={playerState.paused ? "Play" : "Pause"}
            >
              {playerState.paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button
              onClick={() => player?.nextTrack()}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Next"
            >
              <NextIcon />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-12">
          {!isReady ? (
            <p className="text-zinc-500 text-sm">Connecting player...</p>
          ) : !selectedPlaylist ? (
            <p className="text-zinc-500 text-sm">Select a playlist to start playing.</p>
          ) : (
            <p className="text-zinc-500 text-sm">Loading...</p>
          )}
        </div>
      )}

      {/* Up next queue */}
      {queue.length > 0 && (
        <div>
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Up Next
          </h3>
          <div className="space-y-1">
            {queue.map((track, i) => (
              <div
                key={`${track.uri}-${i}`}
                onClick={() => !track.explicit && handlePlayFromQueue(track.uri)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  track.explicit
                    ? "opacity-40 cursor-default"
                    : "bg-zinc-800/40 hover:bg-zinc-700/60 cursor-pointer"
                }`}
                title={track.explicit ? "Explicit — will be skipped automatically" : "Click to play"}
              >
                {/* Small album art */}
                {track.albumArt ? (
                  <div className="relative w-8 h-8 rounded shrink-0 overflow-hidden">
                    <Image
                      src={track.albumArt}
                      alt={track.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded shrink-0 bg-zinc-700" />
                )}

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm leading-tight truncate ${
                      track.explicit
                        ? "line-through text-zinc-500"
                        : "text-white"
                    }`}
                  >
                    {track.name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{track.artists}</p>
                </div>

                {/* Explicit badge */}
                {track.explicit && (
                  <span
                    className="shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-zinc-700 text-zinc-400"
                    title="Explicit — will be skipped"
                  >
                    E
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SpotifyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6l6-4.269V16.27L8.5 12zM16 6h2v12h-2z" />
    </svg>
  )
}
