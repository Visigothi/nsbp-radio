"use client"

import dynamic from "next/dynamic"
import { useCommercialStore } from "@/lib/commercial-store"

const SpotifyPanel = dynamic(() => import("./SpotifyPanel"), { ssr: false })
const CommercialPanel = dynamic(() => import("./CommercialPanel"), { ssr: false })

export default function AppShell() {
  const status = useCommercialStore((s) => s.status)
  const queued = useCommercialStore((s) => s.queued)
  const clearQueue = useCommercialStore((s) => s.clearQueue)
  const isCommercialPlaying = status === "playing"
  const isCommercialQueued = status === "queued"

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Queued announcement banner */}
      {isCommercialQueued && queued && (
        <div className="shrink-0 bg-blue-900/50 border-b border-blue-800 px-6 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-blue-200 text-sm">
              Announcement queued:{" "}
              <span className="font-medium">{queued.file.displayName}</span>
              {queued.mode === "queue" && " — will play after current track"}
            </span>
          </div>
          <button
            onClick={clearQueue}
            className="text-blue-400 hover:text-white text-xs px-2 py-0.5 rounded border border-blue-700 hover:border-blue-400 transition-colors shrink-0"
            title="Remove from queue"
          >
            Remove
          </button>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
        {/* Left: Spotify panel (~60%) */}
        <div className={`flex-[3] min-h-0 p-6 overflow-y-auto transition-opacity ${isCommercialPlaying ? "opacity-40 pointer-events-none" : ""}`}>
          <SpotifyPanel />
        </div>

        {/* Right: Announcements panel (~40%) */}
        <div className="flex-[2] min-h-0 p-6 overflow-y-auto">
          <CommercialPanel />
        </div>
      </div>
    </div>
  )
}
