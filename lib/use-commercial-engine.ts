"use client"

import { useEffect, useRef, useCallback } from "react"
import { useSpotifyStore } from "./spotify-store"
import { useCommercialStore } from "./commercial-store"
import { getDriveAudioProxyUrl } from "./drive-api"
import { skipToNext } from "./spotify-api"

const QUEUE_TRIGGER_MS = 1500 // pause Spotify when this many ms remain
const FADE_DURATION_MS = 1500
const FADE_STEPS = 30

export function useCommercialEngine() {
  const { tokens, player, deviceId } = useSpotifyStore()
  const { queued, status, setStatus, setPlayingFile, clearQueue, pendingTrack, setAnnouncementProgress } =
    useCommercialStore()

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const engineBusy = useRef(false)

  // Stable refs to avoid stale closures in async callbacks
  const playerRef = useRef(player)
  const tokensRef = useRef(tokens)
  const deviceIdRef = useRef(deviceId)
  const queuedRef = useRef(queued)
  const pendingTrackRef = useRef(pendingTrack)
  useEffect(() => { playerRef.current = player }, [player])
  useEffect(() => { tokensRef.current = tokens }, [tokens])
  useEffect(() => { deviceIdRef.current = deviceId }, [deviceId])
  useEffect(() => { queuedRef.current = queued }, [queued])
  useEffect(() => { pendingTrackRef.current = pendingTrack }, [pendingTrack])

  // Fade Spotify volume in or out via the SDK
  const fadeVolume = useCallback(
    async (from: number, to: number): Promise<void> => {
      const p = playerRef.current
      if (!p) return
      const step = (to - from) / FADE_STEPS
      const delay = FADE_DURATION_MS / FADE_STEPS
      let vol = from
      for (let i = 0; i < FADE_STEPS; i++) {
        vol += step
        p.setVolume(Math.max(0, Math.min(1, vol)))
        await new Promise((r) => setTimeout(r, delay))
      }
      p.setVolume(to)
    },
    []
  )

  const playAnnouncement = useCallback(
    async (mode: "queue" | "interrupt") => {
      const p = playerRef.current
      const t = tokensRef.current
      const dId = deviceIdRef.current
      const q = queuedRef.current
      if (!q || !t || !p || !dId || engineBusy.current) return
      engineBusy.current = true

      const { file } = q
      setStatus("playing")
      setPlayingFile(file)

      // Capture live position so we can resume from the same spot (interrupt only)
      let capturedPosition = 0
      if (mode === "interrupt") {
        const liveState = await p.getCurrentState()
        capturedPosition = liveState?.position ?? 0
      }

      try {
        if (mode === "interrupt") {
          await fadeVolume(1, 0)
          await p.pause()
        }

        const audioUrl = getDriveAudioProxyUrl(file.id)
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        // Stream live position into the store for the progress bar
        const onTimeUpdate = () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setAnnouncementProgress({
              position: audio.currentTime * 1000,
              duration: audio.duration * 1000,
            })
          }
        }
        audio.addEventListener("timeupdate", onTimeUpdate)

        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("ended", () => resolve())
          audio.addEventListener("error", (e) => reject(e))
          audio.play().catch(reject)
        })

        audio.removeEventListener("timeupdate", onTimeUpdate)
        setAnnouncementProgress(null)

        // After announcement: check for a pending user-selected track
        const pending = pendingTrackRef.current

        if (pending) {
          // User clicked a queue track while the announcement was waiting —
          // play that track now instead of resuming the original one.
          const body = pending.contextUri
            ? {
                context_uri: pending.contextUri,
                offset: { uri: pending.trackUri },
                position_ms: 0,
              }
            : { uris: [pending.trackUri] }

          await fetch(
            `https://api.spotify.com/v1/me/player/play?device_id=${dId}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${t.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }
          )
          await fadeVolume(0, 1)
        } else if (mode === "interrupt") {
          // Normal interrupt: resume from the same position in the same track
          await p.resume()
          if (capturedPosition > 0) {
            await fetch(
              `https://api.spotify.com/v1/me/player/seek?position_ms=${capturedPosition}&device_id=${dId}`,
              {
                method: "PUT",
                headers: { Authorization: `Bearer ${t.accessToken}` },
              }
            )
          }
          await fadeVolume(0, 1)
        } else {
          // Queue mode: skip to next track and resume
          await skipToNext(t.accessToken, dId)
          await p.resume()
        }
      } catch (err) {
        console.error("Announcement playback error:", err)
        try {
          p.setVolume(1)
          p.resume()
        } catch {}
      } finally {
        audioRef.current = null
        engineBusy.current = false
        clearQueue() // also clears pendingTrack
      }
    },
    [fadeVolume, setStatus, setPlayingFile, clearQueue]
  )

  // Queue mode: poll for song end using live getCurrentState()
  useEffect(() => {
    if (status !== "queued" || !queued || queued.mode !== "queue") {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    pollRef.current = setInterval(async () => {
      if (engineBusy.current) return
      const p = playerRef.current
      if (!p) return
      const liveState = await p.getCurrentState()
      if (!liveState || liveState.paused) return
      const remaining = liveState.duration - liveState.position
      if (remaining <= QUEUE_TRIGGER_MS && remaining > 0) {
        if (pollRef.current) clearInterval(pollRef.current)
        await p.pause()
        await playAnnouncement("queue")
      }
    }, 500)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, queued, playAnnouncement])

  // Interrupt mode: play immediately when queued
  useEffect(() => {
    if (status !== "queued" || !queued || queued.mode !== "interrupt") return
    playAnnouncement("interrupt")
  }, [status, queued, playAnnouncement])

  const skipCommercial = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    engineBusy.current = false
    setAnnouncementProgress(null)
    playerRef.current?.setVolume(1)
    playerRef.current?.resume()
    clearQueue()
  }, [clearQueue, setAnnouncementProgress])

  return { skipCommercial }
}
