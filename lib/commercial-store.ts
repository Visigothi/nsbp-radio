"use client"

import { create } from "zustand"
import { DriveFile } from "./drive-api"

export type CommercialMode = "queue" | "interrupt"

export interface QueuedCommercial {
  file: DriveFile
  mode: CommercialMode
}

export type CommercialStatus = "idle" | "queued" | "playing"

export interface PendingTrack {
  trackUri: string
  contextUri: string | null // playlist context, if known
}

interface CommercialStore {
  files: DriveFile[]
  folderId: string
  queued: QueuedCommercial | null
  status: CommercialStatus
  playingFile: DriveFile | null
  /** Track to play after the current announcement finishes */
  pendingTrack: PendingTrack | null
  /** Live playback position of the currently-playing announcement (ms), or null when idle */
  announcementProgress: { position: number; duration: number } | null
  /** Whether "Closing Time" has been added to the Spotify queue */
  closingTimeQueued: boolean
  /** Set when Closing Time was queued then removed — causes auto-skip when it starts playing */
  closingTimeRemoved: boolean

  setFiles: (files: DriveFile[]) => void
  setFolderId: (id: string) => void
  queueCommercial: (file: DriveFile, mode: CommercialMode) => void
  clearQueue: () => void
  setStatus: (status: CommercialStatus) => void
  setPlayingFile: (file: DriveFile | null) => void
  setPendingTrack: (track: PendingTrack | null) => void
  setAnnouncementProgress: (p: { position: number; duration: number } | null) => void
  setClosingTimeQueued: (queued: boolean) => void
  setClosingTimeRemoved: (removed: boolean) => void
}

// Hardcoded announcements folder — no user configuration needed
export const ANNOUNCEMENTS_FOLDER_ID = "1fiQBvHdVwm1EymnH-OAOnGFhtjSA0nED"

export const useCommercialStore = create<CommercialStore>((set) => ({
  files: [],
  folderId: ANNOUNCEMENTS_FOLDER_ID,
  queued: null,
  status: "idle",
  playingFile: null,
  pendingTrack: null,
  announcementProgress: null,
  closingTimeQueued: false,
  closingTimeRemoved: false,

  setFiles: (files) => set({ files }),
  setFolderId: (folderId) => set({ folderId }),
  // Queuing an announcement replaces any existing queued item (announcement or Closing Time)
  queueCommercial: (file, mode) => set({ queued: { file, mode }, status: "queued", closingTimeQueued: false }),
  clearQueue: () => set({ queued: null, status: "idle", playingFile: null, pendingTrack: null }),
  setStatus: (status) => set({ status }),
  setPlayingFile: (playingFile) => set({ playingFile }),
  setPendingTrack: (pendingTrack) => set({ pendingTrack }),
  setAnnouncementProgress: (announcementProgress) => set({ announcementProgress }),
  setClosingTimeQueued: (closingTimeQueued) => set({ closingTimeQueued }),
  setClosingTimeRemoved: (closingTimeRemoved) => set({ closingTimeRemoved }),
}))
