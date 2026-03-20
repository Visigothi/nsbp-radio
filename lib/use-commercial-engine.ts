"use client"

import { useEffect, useRef, useCallback } from "react"
import { useSpotifyStore } from "./spotify-store"
import { useCommercialStore } from "./commercial-store"
import { getDriveAudioUrl } from "./drive-api"
import { skipToNext } from "./spotify-api"

const QUEUE_TRIGGER_MS = 1500 // pause Spotify when this many ms remain
const FADE_DURATION_MS = 1500
const FADE_STEPS = 30

export function useCommercialEngine() {
  const { tokens, player, deviceId, playerState } = useSpotifyStore()
  const { queued, status, folderId, setStatus, setPlayingFile, clearQueue } =
    useCommercialStore()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const engineBusy = useRef(false)

  // Fade Spotify volume in or out via the SDK
  const fadeVolume = useCallback(
    async (from: number, to: number): Promise<void> => {
      if (!player) return
      const step = (to - from) / FADE_STEPS
      const delay = FADE_DURATION_MS / FADE_STEPS
      let vol = from
      for (let i = 0; i < FADE_STEPS; i++) {
        vol += step
        player.setVolume(Math.max(0, Math.min(1, vol)))
        await new Promise((r) => setTimeout(r, delay))
      }
      player.setVolume(to)
    },
    [player]
  )

  const playCommercial = useCallback(
    async (mode: "queue" | "interrupt") => {
      if (!queued || !tokens || !player || !deviceId || engineBusy.current) return
      engineBusy.current = true

      const { file } = queued
      setStatus("playing")
      setPlayingFile(file)

      const capturedPosition = playerState?.position ?? 0

      try {
        if (mode === "interrupt") {
          // Fade out then pause
          await fadeVolume(1, 0)
          await player.pause()
        } else {
          // Queue mode: Spotify is already paused (we paused it at song end)
          // Skip to next so resume starts fresh track
        }

        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ""
        const audioUrl = getDriveAudioUrl(file.id, apiKey)
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("ended", () => resolve())
          audio.addEventListener("error", (e) => reject(e))
          audio.play().catch(reject)
        })

        // Resume Spotify
        if (mode === "interrupt") {
          // Resume from same position in same track
          await player.resume()
          if (capturedPosition > 0 && tokens) {
            await fetch(
              `https://api.spotify.com/v1/me/player/seek?position_ms=${capturedPosition}&device_id=${deviceId}`,
              {
                method: "PUT",
                headers: { Authorization: `Bearer ${tokens.accessToken}` },
              }
            )
          }
          await fadeVolume(0, 1)
        } else {
          // Queue mode: skip to next track and resume
          await skipToNext(tokens.accessToken, deviceId)
          await player.resume()
        }
      } catch (err) {
        console.error("Commercial playback error:", err)
        // Try to recover
        try {
          player.setVolume(1)
          player.resume()
        } catch {}
      } finally {
        audioRef.current = null
        engineBusy.current = false
        clearQueue()
      }
    },
    [queued, tokens, player, deviceId, playerState, fadeVolume, setStatus, setPlayingFile, clearQueue]
  )

  // Queue mode: poll for song end
  useEffect(() => {
    if (status !== "queued" || !queued || queued.mode !== "queue") {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    pollRef.current = setInterval(async () => {
      if (!playerState || playerState.paused || engineBusy.current) return
      const remaining = playerState.duration - playerState.position
      if (remaining <= QUEUE_TRIGGER_MS && remaining > 0) {
        if (pollRef.current) clearInterval(pollRef.current)
        await player?.pause()
        await playCommercial("queue")
      }
    }, 500)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, queued, playerState, player, playCommercial])

  // Interrupt mode: play immediately when queued
  useEffect(() => {
    if (status !== "queued" || !queued || queued.mode !== "interrupt") return
    playCommercial("interrupt")
  }, [status, queued, playCommercial])

  const skipCommercial = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    engineBusy.current = false
    player?.setVolume(1)
    player?.resume()
    clearQueue()
  }, [player, clearQueue])

  return { skipCommercial }
}
