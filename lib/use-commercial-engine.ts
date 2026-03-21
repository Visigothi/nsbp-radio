/**
 * use-commercial-engine.ts — Announcement audio playback engine
 *
 * This is the core of the announcements feature. It watches the commercial
 * store and orchestrates fading Spotify out, playing a Drive audio file,
 * then fading Spotify back in — with two distinct operating modes:
 *
 * ── Queue mode ────────────────────────────────────────────────────────────
 * The announcement plays between songs. A polling interval checks the live
 * playback position every 500ms. When QUEUE_TRIGGER_MS (1500ms) remain in
 * the current track, playAnnouncement("queue") is called:
 *   1. Fade Spotify volume to 0 over 1.5 seconds
 *   2. Pause Spotify
 *   3. Play the announcement audio file from Google Drive
 *   4. After it ends: skip to next Spotify track, resume, fade volume back up
 *
 * ── Interrupt mode ────────────────────────────────────────────────────────
 * The announcement plays immediately, interrupting the current track.
 * Triggered when the user clicks "Play Now" on an announcement.
 *   1. Capture the current playback position (to resume from the same spot)
 *   2. Fade Spotify volume to 0 over 1.5 seconds
 *   3. Pause Spotify
 *   4. Play the announcement audio file
 *   5. After it ends: resume Spotify at the captured position, fade back up
 *
 * ── Pending track handling ────────────────────────────────────────────────
 * If the user clicks a track in the Up Next list while an announcement is
 * queued (in either mode), SpotifyPanel stores the desired track as a
 * "pending track" in the commercial store. After the announcement ends,
 * the engine checks for a pending track and plays it instead of resuming
 * the original track.
 *
 * ── Stable refs pattern ──────────────────────────────────────────────────
 * The engine uses useRef() to keep stable copies of all mutable values
 * (player, tokens, deviceId, queued, pendingTrack). This is necessary
 * because the async playAnnouncement function captures these values in a
 * closure at call time. Without refs, the closure would hold stale values
 * from when the effect first ran, not the current values.
 *
 * ── engineBusy guard ─────────────────────────────────────────────────────
 * The engineBusy ref prevents overlapping announcement plays. Once
 * playAnnouncement starts, it cannot be called again until it finishes
 * and sets engineBusy.current = false in the finally block.
 */

"use client"

import { useEffect, useRef, useCallback } from "react"
import { useSpotifyStore } from "./spotify-store"
import { useCommercialStore } from "./commercial-store"
import { getDriveAudioProxyUrl } from "./drive-api"
import { skipToNext } from "./spotify-api"

/** How many ms before the track ends to start fading for a queued announcement */
const QUEUE_TRIGGER_MS = 1500
/** Total duration of the volume fade in milliseconds */
const FADE_DURATION_MS = 1500
/** Number of discrete steps in each fade (higher = smoother) */
const FADE_STEPS = 30

export function useCommercialEngine() {
  const { tokens, player, deviceId } = useSpotifyStore()
  const {
    queued,
    status,
    setStatus,
    setPlayingFile,
    clearQueue,
    pendingTrack,
    setAnnouncementProgress,
  } = useCommercialStore()

  // Ref for the currently-playing <audio> element (announcement audio).
  // Stored in a ref so skipCommercial() can pause it from outside the effect.
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Ref for the queue-mode polling interval handle
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Guard: prevents overlapping calls to playAnnouncement
  const engineBusy = useRef(false)

  // ── Stable refs — updated whenever their source values change ────────────
  // These allow the async playAnnouncement callback to always read fresh
  // values even though it was created in a closure with stale values.
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

  /**
   * Fades the Spotify player volume between two values over FADE_DURATION_MS.
   * Uses the stable playerRef so it always targets the current player instance.
   *
   * @param from — Starting volume (0–1)
   * @param to   — Ending volume (0–1)
   */
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
      p.setVolume(to) // Snap to exact target to avoid floating-point drift
    },
    [] // No deps — always reads from stable refs
  )

  /**
   * Core announcement playback function.
   * Reads all state from refs (not from closed-over hook variables) so that
   * it sees the latest values even when called from inside async callbacks.
   *
   * @param mode — "queue" (between tracks) or "interrupt" (immediate)
   */
  const playAnnouncement = useCallback(
    async (mode: "queue" | "interrupt") => {
      const p = playerRef.current
      const t = tokensRef.current
      const dId = deviceIdRef.current
      const q = queuedRef.current

      // Abort if any required dependency is missing or engine is already busy
      if (!q || !t || !p || !dId || engineBusy.current) return
      engineBusy.current = true

      const { file } = q
      setStatus("playing")
      setPlayingFile(file)

      // For interrupt mode: capture the exact playback position now so we can
      // seek back to this point after the announcement finishes.
      // We call getCurrentState() directly (not from the store) because the
      // store's position value is a snapshot that may be seconds stale.
      let capturedPosition = 0
      if (mode === "interrupt") {
        const liveState = await p.getCurrentState()
        capturedPosition = liveState?.position ?? 0
      }

      try {
        // Fade out and pause Spotify — applies to both queue and interrupt modes
        await fadeVolume(1, 0)
        await p.pause()

        // Create and play the announcement audio via the Drive proxy route.
        // The proxy route adds the Google Bearer token server-side because
        // the browser's <audio> element cannot set Authorization headers.
        const audioUrl = getDriveAudioProxyUrl(file.id)
        const audio = new Audio(audioUrl)
        audioRef.current = audio

        /**
         * Stream live position from the <audio> element into the store.
         * CommercialPanel reads this to render the announcement progress bar.
         * audio.duration is NaN until the browser has loaded enough metadata,
         * so we guard with isNaN() before writing.
         */
        const onTimeUpdate = () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setAnnouncementProgress({
              position: audio.currentTime * 1000,  // Convert seconds → ms
              duration: audio.duration * 1000,
            })
          }
        }
        audio.addEventListener("timeupdate", onTimeUpdate)

        // Wait for the announcement to finish (or throw on error)
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("ended", () => resolve())
          audio.addEventListener("error", (e) => reject(e))
          audio.play().catch(reject)
        })

        // Cleanup audio listeners and clear the progress bar
        audio.removeEventListener("timeupdate", onTimeUpdate)
        setAnnouncementProgress(null)

        // ── Post-announcement: what to play next? ─────────────────────────
        const pending = pendingTrackRef.current

        if (pending) {
          /**
           * The user clicked a track in Up Next while the announcement was
           * queued/playing. Play that track now instead of resuming the original.
           * If we have a playlist context URI, play within the playlist so the
           * queue continues from that point. Otherwise play the track standalone.
           */
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
          await fadeVolume(0, 1) // Fade back up for the new track

        } else if (mode === "interrupt") {
          /**
           * Normal interrupt: resume the original track at the exact position
           * it was at when we interrupted it. The seek call is needed because
           * Spotify's resume() restarts from wherever the server thinks the
           * position is, which may differ from our captured snapshot.
           */
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
          /**
           * Queue mode: announcement played between tracks, so skip to the
           * next Spotify track (the current one has ended) and fade back in.
           */
          await skipToNext(t.accessToken, dId)
          await p.resume()
          await fadeVolume(0, 1)
        }

      } catch (err) {
        console.error("Announcement playback error:", err)
        // Best-effort recovery: restore volume and resume playback
        try {
          p.setVolume(1)
          p.resume()
        } catch {}
      } finally {
        // Always clean up, even on error
        audioRef.current = null
        engineBusy.current = false
        clearQueue() // Resets status, queued, playingFile, and pendingTrack
      }
    },
    [fadeVolume, setStatus, setPlayingFile, clearQueue, setAnnouncementProgress]
  )

  /**
   * Queue mode trigger: polls the live playback position every 500ms.
   * When QUEUE_TRIGGER_MS remain in the current track, starts the announcement.
   *
   * Why getCurrentState() instead of playerState.position from the store?
   *   playerState in the store is a snapshot from the last player_state_changed
   *   event — it could be several seconds stale. getCurrentState() makes a fresh
   *   SDK call and returns the current position to the millisecond.
   *
   * The poll is cleared and recreated whenever status or queued changes
   * (the return cleanup handles this). It does not run if the announcement
   * is in interrupt mode — that's handled by the next useEffect below.
   */
  useEffect(() => {
    if (status !== "queued" || !queued || queued.mode !== "queue") {
      // Not in queue mode — clear any existing poll
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    pollRef.current = setInterval(async () => {
      if (engineBusy.current) return // Don't start if already playing
      const p = playerRef.current
      if (!p) return

      const liveState = await p.getCurrentState()
      if (!liveState || liveState.paused) return // Don't trigger when paused

      const remaining = liveState.duration - liveState.position
      if (remaining <= QUEUE_TRIGGER_MS && remaining > 0) {
        // Within trigger window — start the announcement sequence
        if (pollRef.current) clearInterval(pollRef.current)
        await playAnnouncement("queue")
      }
    }, 500) // Check every 500ms for a smooth trigger

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, queued, playAnnouncement])

  /**
   * Interrupt mode trigger: starts playAnnouncement immediately when an
   * announcement is queued in interrupt mode.
   * The engine guard (engineBusy) prevents this from firing if already busy.
   */
  useEffect(() => {
    if (status !== "queued" || !queued || queued.mode !== "interrupt") return
    playAnnouncement("interrupt")
  }, [status, queued, playAnnouncement])

  /**
   * Allows the CommercialPanel's "Skip" button to abort a playing announcement.
   * Stops the audio, resets all engine state, restores Spotify volume,
   * and resumes playback.
   */
  const skipCommercial = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    engineBusy.current = false
    setAnnouncementProgress(null)
    playerRef.current?.setVolume(1) // Restore full volume immediately (no fade)
    playerRef.current?.resume()
    clearQueue()
  }, [clearQueue, setAnnouncementProgress])

  return { skipCommercial }
}
