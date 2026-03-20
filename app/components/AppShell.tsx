"use client"

import dynamic from "next/dynamic"
import { useCommercialStore } from "@/lib/commercial-store"

const SpotifyPanel = dynamic(() => import("./SpotifyPanel"), { ssr: false })
const CommercialPanel = dynamic(() => import("./CommercialPanel"), { ssr: false })

export default function AppShell() {
  const status = useCommercialStore((s) => s.status)
  const isCommercialPlaying = status === "playing"

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
      {/* Left: Spotify panel (~60%) */}
      <div className="flex-[3] min-h-0 p-6 overflow-y-auto">
        <SpotifyPanel disabled={isCommercialPlaying} />
      </div>

      {/* Right: Commercial panel (~40%) */}
      <div className="flex-[2] min-h-0 p-6 overflow-y-auto">
        <CommercialPanel />
      </div>
    </div>
  )
}
