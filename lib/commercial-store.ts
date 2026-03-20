"use client"

import { create } from "zustand"
import { DriveFile } from "./drive-api"

export type CommercialMode = "queue" | "interrupt"

export interface QueuedCommercial {
  file: DriveFile
  mode: CommercialMode
}

export type CommercialStatus = "idle" | "queued" | "playing"

interface CommercialStore {
  files: DriveFile[]
  folderId: string
  queued: QueuedCommercial | null
  status: CommercialStatus
  playingFile: DriveFile | null

  setFiles: (files: DriveFile[]) => void
  setFolderId: (id: string) => void
  queueCommercial: (file: DriveFile, mode: CommercialMode) => void
  clearQueue: () => void
  setStatus: (status: CommercialStatus) => void
  setPlayingFile: (file: DriveFile | null) => void
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

  setFiles: (files) => set({ files }),
  setFolderId: (folderId) => {
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, folderId)
    set({ folderId })
  },
  queueCommercial: (file, mode) => set({ queued: { file, mode }, status: "queued" }),
  clearQueue: () => set({ queued: null, status: "idle", playingFile: null }),
  setStatus: (status) => set({ status }),
  setPlayingFile: (playingFile) => set({ playingFile }),
}))
