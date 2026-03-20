"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useSpotifyStore } from "@/lib/spotify-store"
import { useCommercialStore } from "@/lib/commercial-store"

const CLOSING_TIME_ID = "1A5V1sxyCLpKJezp75tUXn"
const CLOSING_TIME_URI = `spotify:track:${CLOSING_TIME_ID}`
const FADE_STEPS = 30
const FADE_DURATION_MS = 1500

interface TrackInfo {
  name: string
  artists: string
  albumName: string
  albumArt: string
}

export default function ClosingTimeSection() {
  const { tokens, player, deviceId, playerState } = useSpotifyStore()
  const { closingTimeQueued, setClosingTimeQueued, clearQueue, closingTimeRemoved, setClosingTimeRemoved } = useCommercialStore()
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [busy, setBusy] = useState(false)

  // Fetch track info once we have a Spotify token
  useEffect(() => {
    if (!tokens) return
    fetch(`https://api.spotify.com/v1/tracks/${CLOSING_TIME_ID}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((r) => r.json())
      .then((t) => {
        setTrack({
          name: t.name,
          artists: t.artists.map((a: { name: string }) => a.name).join(", "),
          albumName: t.album.name,
          albumArt: t.album.images[1]?.url ?? t.album.images[0]?.url ?? "",
        })
      })
      .catch(console.error)
  }, [tokens])

  // When Closing Time starts playing:
  // - If it was queued normally, clear the queued flag (expected play)
  // - If it was queued then removed, auto-skip it immediately
  useEffect(() => {
    if (playerState?.trackUri !== CLOSING_TIME_URI) return
    if (closingTimeQueued) {
      setClosingTimeQueued(false)
    } else if (closingTimeRemoved && tokens && deviceId) {
      setClosingTimeRemoved(false)
      fetch(`https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      }).catch(console.error)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState?.trackUri])

  const handleQueue = async () => {
    if (!tokens || !deviceId || busy || closingTimeQueued) return
    setBusy(true)
    // Replace any currently queued announcement
    clearQueue()
    try {
      await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(CLOSING_TIME_URI)}&device_id=${deviceId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }
      )
      setClosingTimeQueued(true)
    } catch (err) {
      console.error("Closing Time queue error:", err)
    } finally {
      setBusy(false)
    }
  }

  const handlePlayNow = async () => {
    if (!tokens || !player || !deviceId || busy) return
    setBusy(true)
    // If it was queued, clear that flag since we're playing it now
    if (closingTimeQueued) setClosingTimeQueued(false)
    try {
      // Fade out
      const delay = FADE_DURATION_MS / FADE_STEPS
      for (let i = FADE_STEPS; i >= 0; i--) {
        player.setVolume(i / FADE_STEPS)
        await new Promise((r) => setTimeout(r, delay))
      }

      // Add Closing Time to the user queue, then skip to it.
      // This preserves the playlist context so the playlist resumes after Closing Time ends.
      await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(CLOSING_TIME_URI)}&device_id=${deviceId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }
      )
      await fetch(
        `https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }
      )

      // Fade back in
      for (let i = 0; i <= FADE_STEPS; i++) {
        player.setVolume(i / FADE_STEPS)
        await new Promise((r) => setTimeout(r, delay))
      }
    } catch (err) {
      console.error("Closing Time play error:", err)
      player.setVolume(1)
    } finally {
      setBusy(false)
    }
  }

  if (!tokens) return null

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,157,26,0.15)" }}>
      {/* Section heading */}
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
        Closing Time
      </h2>

      {track ? (
        <div
          className="hover-brand rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2.5 flex items-center gap-3"
        >
          {/* Album art */}
          {track.albumArt && (
            <div className="relative w-12 h-12 rounded shrink-0 overflow-hidden">
              <Image
                src={track.albumArt}
                alt={track.albumName}
                fill
                className="object-cover"
              />
            </div>
          )}

          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium truncate">{track.name}</p>
            <p className="text-xs text-zinc-400 truncate">{track.artists}</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleQueue}
              disabled={busy || closingTimeQueued}
              className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Play after current track ends"
            >
              Queue
            </button>
            <button
              onClick={handlePlayNow}
              disabled={busy}
              className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Fade out music and play now"
            >
              Play Now
            </button>
          </div>
        </div>
      ) : (
        <p className="text-zinc-600 text-xs">
          {tokens ? "Loading..." : "Connect Spotify to use Closing Time"}
        </p>
      )}
    </div>
  )
}
