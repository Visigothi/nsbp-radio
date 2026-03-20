"use client"

import dynamic from "next/dynamic"
import { useCommercialStore } from "@/lib/commercial-store"
import { useExplicitFilter } from "@/lib/use-explicit-filter"

const SpotifyPanel = dynamic(() => import("./SpotifyPanel"), { ssr: false })
const CommercialPanel = dynamic(() => import("./CommercialPanel"), { ssr: false })

export default function AppShell() {
  // Hard-block explicit tracks — runs silently in the background
  useExplicitFilter()

  const status = useCommercialStore((s) => s.status)
  const isCommercialPlaying = status === "playing"

  return (
    <div className="flex flex-col flex-1 min-h-0">
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
