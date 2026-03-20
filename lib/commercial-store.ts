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
  setClosingTimeQueued: (queued: boolean) => void
  setClosingTimeRemoved: (removed: boolean) => void
}

const DEFAULT_FOLDER_ID = process.env.NEXT_PUBLIC_DEFAULT_DRIVE_FOLDER_ID ?? ""
const LS_KEY = "nsbp_radio_folder_id"

function getInitialFolderId(): string {
  if (typeof window === "undefined") return DEFAULT_FOLDER_ID
  return localStorage.getItem(LS_KEY) ?? DEFAULT_FOLDER_ID
}

export const useCommercialStore = create<CommercialStore>((set) => ({
  files: [],
  folderId: getInitialFolderId(),
  queued: null,
  status: "idle",
  playingFile: null,
  pendingTrack: null,
  closingTimeQueued: false,
  closingTimeRemoved: false,

  setFiles: (files) => set({ files }),
  setFolderId: (folderId) => {
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, folderId)
    set({ folderId })
  },
  // Queuing an announcement replaces any existing queued item (announcement or Closing Time)
  queueCommercial: (file, mode) => set({ queued: { file, mode }, status: "queued", closingTimeQueued: false }),
  clearQueue: () => set({ queued: null, status: "idle", playingFile: null, pendingTrack: null }),
  setStatus: (status) => set({ status }),
  setPlayingFile: (playingFile) => set({ playingFile }),
  setPendingTrack: (pendingTrack) => set({ pendingTrack }),
  setClosingTimeQueued: (closingTimeQueued) => set({ closingTimeQueued }),
  setClosingTimeRemoved: (closingTimeRemoved) => set({ closingTimeRemoved }),
}))
