"use client"

import { useEffect, useState } from "react"
import { useCommercialStore, ANNOUNCEMENTS_FOLDER_ID } from "@/lib/commercial-store"
import { useCommercialEngine } from "@/lib/use-commercial-engine"
import { DriveFile } from "@/lib/drive-api"
import ClosingTimeSection from "./ClosingTimeSection"

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export default function CommercialPanel() {
  const {
    files,
    status,
    playingFile,
    queued,
    announcementProgress,
    setFiles,
    queueCommercial,
  } = useCommercialStore()

  const { skipCommercial } = useCommercialEngine()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const loadFiles = async () => {
    setLoading(true)
    setError(null)
    setAccessDenied(false)
    try {
      const res = await fetch(`/api/drive/files?folderId=${encodeURIComponent(ANNOUNCEMENTS_FOLDER_ID)}`)
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
        setError("Failed to load announcements.")
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
      setError("Failed to load announcements.")
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col" style={{ gap: "var(--panel-gap)" }}>

      {/* ── Section 1: Announcements ──────────────────────────────────────── */}
      <div className="panel-card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="theme-header text-sm font-semibold uppercase tracking-wider">
          Announcements
        </h2>
      </div>

      {/* ── Now Playing box ──────────────────────────────────────── */}
      {status === "playing" && playingFile && (
        <div
          className="rounded-xl p-3 flex flex-col gap-2"
          style={{ background: "rgba(255,157,26,0.1)", border: "1px solid rgba(255,157,26,0.45)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
            Now Playing
          </p>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full animate-pulse shrink-0"
                style={{ background: "var(--brand-orange)" }}
              />
              <span className="text-white text-sm font-medium truncate">
                {playingFile.displayName}
              </span>
            </div>
            <button
              onClick={skipCommercial}
              className="text-xs shrink-0 px-2 py-1 rounded transition-colors hover:text-white"
              style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,157,26,0.4)" }}
            >
              Skip
            </button>
          </div>

          {/* Progress bar */}
          {announcementProgress && announcementProgress.duration > 0 && (
            <div className="space-y-1">
              <div className="w-full rounded-full h-1" style={{ background: "rgba(255,157,26,0.2)" }}>
                <div
                  className="h-1 rounded-full transition-none"
                  style={{
                    width: `${(announcementProgress.position / announcementProgress.duration) * 100}%`,
                    background: "var(--brand-orange)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px]" style={{ color: "rgba(255,157,26,0.6)" }}>
                <span>{formatMs(announcementProgress.position)}</span>
                <span>{formatMs(announcementProgress.duration)}</span>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Access denied dialog */}
      {accessDenied && (
        <div className="bg-red-950/50 border border-red-700 rounded-lg p-3 space-y-1.5">
          <p className="text-red-300 text-sm font-medium">Access Denied</p>
          <p className="text-red-400 text-xs leading-snug">
            You do not have the privileges to sign into the Sound Board where
            Announcements are stored. Talk to Mike about it.
          </p>
          <button
            onClick={() => setAccessDenied(false)}
            className="text-xs text-red-400 hover:text-red-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File list — constrained height so Closing Time card stays visible */}
      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: "var(--announcements-list-max-h)" }}>
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
      </div>{/* end Announcements panel-card */}

      {/* ── Section 2: Closing Time ───────────────────────────────────────── */}
      <div className="panel-card">
        <ClosingTimeSection />
      </div>

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
          className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Play after current track ends"
        >
          Queue
        </button>
        <button
          onClick={onInterrupt}
          disabled={disabled || isQueued || isPlaying}
          className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Fade out music and play now"
        >
          Play Now
        </button>
      </div>
    </div>
  )
}

