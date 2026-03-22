/**
 * commercial-store.ts — Zustand global state store for the Announcements panel
 *
 * Manages everything related to the Google Drive announcement audio files:
 * the file list, the queued announcement, playback status, the progress bar,
 * and the "Closing Time" track state.
 *
 * Terminology used throughout the codebase:
 *   "announcement" — an MP3 file from the Google Drive announcements folder
 *   "queue mode"   — announcement will play automatically when the current Spotify track ends
 *   "interrupt mode" — announcement fades out music immediately and plays now
 *   "pending track" — a Spotify track the user clicked while an announcement was queued;
 *                     stored here so the engine can play it after the announcement finishes
 *
 * The announcements Drive folder is hardcoded as ANNOUNCEMENTS_FOLDER_ID.
 * There is no user-facing configuration for this — only Mike can change it in code.
 */

"use client"

import { create } from "zustand"
import { DriveFile } from "./drive-api"

/** localStorage key for persisting the announcement gain across sessions */
const LS_GAIN_KEY = "nsbp_announcement_gain"

/**
 * Reads the saved announcement gain from localStorage.
 * Falls back to 1.0 (100%) if not set or invalid.
 * Safe to call during SSR — returns default when window is unavailable.
 */
function getInitialGain(): number {
  if (typeof window === "undefined") return 1.0
  const saved = localStorage.getItem(LS_GAIN_KEY)
  if (saved) {
    const n = parseFloat(saved)
    if (!isNaN(n) && n >= 0.5 && n <= 2.0) return n
  }
  return 1.0
}

/** Whether the announcement plays after the current track or interrupts immediately */
export type CommercialMode = "queue" | "interrupt"

/** A queued announcement: the file to play and how to play it */
export interface QueuedCommercial {
  file: DriveFile
  mode: CommercialMode
}

/** Possible states of the announcement engine */
export type CommercialStatus =
  | "idle"     // Nothing queued or playing
  | "queued"   // An announcement is waiting (either for song end or to interrupt)
  | "playing"  // An announcement audio file is actively playing

/**
 * A Spotify track to play after an announcement finishes.
 * Set when the user clicks a track in the Up Next list while an announcement
 * is already queued — the engine checks this after the announcement ends and
 * plays this track instead of resuming the previous one.
 */
export interface PendingTrack {
  trackUri: string          // Spotify URI of the track to play next
  contextUri: string | null // Playlist context URI (so the playlist continues after); null if unknown
}

interface CommercialStore {
  // ── State ─────────────────────────────────────────────────────────────────
  files: DriveFile[]                    // All MP3 files loaded from the Drive folder
  folderId: string                      // The hardcoded Drive folder ID (not user-editable)
  queued: QueuedCommercial | null       // Currently queued announcement, or null
  status: CommercialStatus              // Current engine state
  playingFile: DriveFile | null         // The file currently playing (shown in Now Playing box)
  pendingTrack: PendingTrack | null     // Spotify track to play after announcement finishes
  /** Live playback position streamed from the <audio> element's timeupdate event */
  announcementProgress: { position: number; duration: number } | null
  /** True when the user has clicked Queue on the Closing Time section */
  closingTimeQueued: boolean
  /**
   * True when the user queued Closing Time and then clicked Remove.
   * Because Spotify has no API to remove items from the user queue once added,
   * we set this flag and auto-skip when Closing Time starts playing.
   */
  closingTimeRemoved: boolean

  // ── Actions ───────────────────────────────────────────────────────────────
  setFiles: (files: DriveFile[]) => void
  setFolderId: (id: string) => void
  /**
   * Queues an announcement file for playback.
   * Always replaces any previously queued item — only one announcement can
   * be in the queue at a time. Also clears the closingTimeQueued flag since
   * an announcement now takes priority.
   */
  queueCommercial: (file: DriveFile, mode: CommercialMode) => void
  /**
   * Clears the entire announcement queue state, including any pending track.
   * Called when an announcement finishes playing, when the user clicks Remove,
   * or when the user clicks Skip.
   */
  clearQueue: () => void
  setStatus: (status: CommercialStatus) => void
  setPlayingFile: (file: DriveFile | null) => void
  setPendingTrack: (track: PendingTrack | null) => void
  setAnnouncementProgress: (p: { position: number; duration: number } | null) => void
  setClosingTimeQueued: (queued: boolean) => void
  setClosingTimeRemoved: (removed: boolean) => void
  /**
   * Gain multiplier applied to announcement audio via Web Audio API GainNode.
   * Range: 0.5 (half volume) to 2.0 (double volume). Default: 1.0 (unchanged).
   * Persisted in localStorage so the setting survives page refreshes.
   */
  announcementGain: number
  setAnnouncementGain: (gain: number) => void
}

/**
 * Hardcoded Google Drive folder ID for the announcements audio files.
 * This is the folder at:
 *   https://drive.google.com/drive/folders/1fiQBvHdVwm1EymnH-OAOnGFhtjSA0nED
 *
 * The logged-in Google account must have at least read access to this folder.
 * If access is denied, CommercialPanel shows the "Talk to Mike" error message.
 */
export const ANNOUNCEMENTS_FOLDER_ID = "1fiQBvHdVwm1EymnH-OAOnGFhtjSA0nED"

export const useCommercialStore = create<CommercialStore>((set) => ({
  // Initial state
  files: [],
  folderId: ANNOUNCEMENTS_FOLDER_ID,
  queued: null,
  status: "idle",
  playingFile: null,
  pendingTrack: null,
  announcementProgress: null,
  closingTimeQueued: false,
  closingTimeRemoved: false,
  announcementGain: getInitialGain(),

  setFiles: (files) => set({ files }),
  setFolderId: (folderId) => set({ folderId }),

  // Queuing always replaces — only one item in queue at a time
  queueCommercial: (file, mode) => set({
    queued: { file, mode },
    status: "queued",
    closingTimeQueued: false, // announcement takes priority over Closing Time
  }),

  // Full reset of all queue-related state
  clearQueue: () => set({
    queued: null,
    status: "idle",
    playingFile: null,
    pendingTrack: null,
  }),

  setStatus: (status) => set({ status }),
  setPlayingFile: (playingFile) => set({ playingFile }),
  setPendingTrack: (pendingTrack) => set({ pendingTrack }),
  setAnnouncementProgress: (announcementProgress) => set({ announcementProgress }),
  setClosingTimeQueued: (closingTimeQueued) => set({ closingTimeQueued }),
  setClosingTimeRemoved: (closingTimeRemoved) => set({ closingTimeRemoved }),
  setAnnouncementGain: (gain) => {
    if (typeof window !== "undefined") localStorage.setItem(LS_GAIN_KEY, String(gain))
    set({ announcementGain: gain })
  },
}))
