"use client"

import { useEffect, useState } from "react"
import { useCommercialStore } from "@/lib/commercial-store"
import { useCommercialEngine } from "@/lib/use-commercial-engine"
import { extractFolderIdFromUrl, DriveFile } from "@/lib/drive-api"
import ClosingTimeSection from "./ClosingTimeSection"

export default function CommercialPanel() {
  const {
    files,
    folderId,
    queued,
    status,
    playingFile,
    setFiles,
    setFolderId,
    queueCommercial,
    clearQueue,
  } = useCommercialStore()

  const { skipCommercial } = useCommercialEngine()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [folderInput, setFolderInput] = useState("")

  const loadFiles = async (id: string) => {
    if (!id) return
    setLoading(true)
    setError(null)
    setAccessDenied(false)
    try {
      const res = await fetch(`/api/drive/files?folderId=${encodeURIComponent(id)}`)
      if (res.status === 403) {
        setAccessDenied(true)
        return
      }
      if (res.status === 401) {
        const body = await res.json()
        if (body.error === "NO_ACCESS_TOKEN") {
          setError("Session expired — please sign out and sign back in.")
        } else {
          setError("Not authenticated.")
        }
        return
      }
      if (!res.ok) {
        setError("Failed to load files. Check the folder ID.")
        return
      }
      const data: { files: { id: string; name: string; mimeType: string }[] } = await res.json()
      const mapped: DriveFile[] = (data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        displayName: f.name
          .replace(/\.mp3$/i, "")
          .replace(/[_-]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      }))
      setFiles(mapped)
    } catch (e) {
      setError("Failed to load files.")
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (folderId) loadFiles(folderId)
  }, [folderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFolderSave = () => {
    const extracted = extractFolderIdFromUrl(folderInput) ?? folderInput.trim()
    if (extracted) {
      setFolderId(extracted)
      setShowSettings(false)
      setFolderInput("")
    }
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
          Announcements
        </h2>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 space-y-2">
          <p className="text-xs text-zinc-400">Google Drive Folder URL or ID</p>
          <input
            type="text"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
            placeholder={folderId}
            className="w-full bg-zinc-900 border border-zinc-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none focus:border-zinc-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleFolderSave}
              className="text-xs bg-zinc-600 hover:bg-zinc-500 text-white px-3 py-1.5 rounded transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => loadFiles(folderId)}
              className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Announcement playing banner */}
      {status === "playing" && playingFile && (
        <div
          className="rounded-lg px-3 py-2 flex items-center justify-between gap-2"
          style={{ background: "rgba(255,157,26,0.1)", border: "1px solid rgba(255,157,26,0.4)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse shrink-0"
              style={{ background: "var(--brand-orange)" }}
            />
            <span className="text-white text-xs font-medium truncate">
              Playing: {playingFile.displayName}
            </span>
          </div>
          <button
            onClick={skipCommercial}
            className="text-xs shrink-0 transition-colors hover:text-white"
            style={{ color: "var(--brand-orange)" }}
          >
            Skip
          </button>
        </div>
      )}

      {/* Queued banner */}
      {status === "queued" && queued && (
        <div
          className="rounded-lg px-3 py-2 flex items-center justify-between gap-2"
          style={{ background: "rgba(255,157,26,0.07)", border: "1px solid rgba(255,157,26,0.25)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full animate-pulse shrink-0"
              style={{ background: "var(--brand-orange)" }}
            />
            <span className="text-zinc-300 text-xs font-medium truncate">
              Queued: {queued.file.displayName}
            </span>
          </div>
          <button
            onClick={clearQueue}
            className="text-xs shrink-0 transition-colors hover:text-white"
            style={{ color: "var(--brand-orange)" }}
            title="Remove from queue"
          >
            Remove
          </button>
        </div>
      )}

      {/* Access denied dialog */}
      {accessDenied && (
        <div className="bg-red-950/50 border border-red-700 rounded-lg p-3 space-y-1.5">
          <p className="text-red-300 text-sm font-medium">Access Denied</p>
          <p className="text-red-400 text-xs leading-snug">
            Your Google account doesn&apos;t have permission to access the
            announcements folder. Contact your administrator to get access.
          </p>
          <button
            onClick={() => setAccessDenied(false)}
            className="text-xs text-red-400 hover:text-red-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {loading && <p className="text-zinc-500 text-sm">Loading files...</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {!loading && !error && !accessDenied && files.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No announcements found in this folder.
          </p>
        )}
        {files.map((file) => (
          <CommercialCard
            key={file.id}
            file={file}
            isQueued={queued?.file.id === file.id && status === "queued"}
            isPlaying={playingFile?.id === file.id && status === "playing"}
            disabled={status === "playing"}
            onQueue={() => queueCommercial(file, "queue")}
            onInterrupt={() => queueCommercial(file, "interrupt")}
          />
        ))}
      </div>

      {/* Closing Time — hardcoded daily closing track */}
      <ClosingTimeSection />
    </div>
  )
}

interface CommercialCardProps {
  file: DriveFile
  isQueued: boolean
  isPlaying: boolean
  disabled: boolean
  onQueue: () => void
  onInterrupt: () => void
}

function CommercialCard({
  file,
  isQueued,
  isPlaying,
  disabled,
  onQueue,
  onInterrupt,
}: CommercialCardProps) {
  const highlight = isQueued
    ? { border: "1px solid rgba(255,157,26,0.35)", background: "rgba(255,157,26,0.07)" }
    : isPlaying
    ? { border: "1px solid rgba(255,157,26,0.6)", background: "rgba(255,157,26,0.12)" }
    : {}

  const highlightClass = !isQueued && !isPlaying
    ? "border border-zinc-700/60 bg-zinc-800/40 hover-brand"
    : ""

  return (
    <div
      className={`rounded-lg px-3 py-2.5 flex items-center gap-2 transition-colors ${highlightClass}`}
      style={isQueued || isPlaying ? highlight : {}}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isQueued && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ background: "var(--brand-orange)" }}
            />
          )}
          {isPlaying && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ background: "var(--brand-orange)" }}
            />
          )}
          <p className="text-sm text-white truncate">{file.displayName}</p>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={onQueue}
          disabled={disabled || isQueued || isPlaying}
          className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Play after current track ends"
        >
          Queue
        </button>
        <button
          onClick={onInterrupt}
          disabled={disabled || isQueued || isPlaying}
          className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Fade out music and play now"
        >
          Play Now
        </button>
      </div>
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
    </svg>
  )
}
