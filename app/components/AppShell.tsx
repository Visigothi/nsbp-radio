/**
 * AppShell.tsx — Top-level layout component for the authenticated app
 *
 * Renders the two-panel layout:
 *   Left  (~60%): SpotifyPanel — playlist selector, now playing, Up Next queue
 *   Right (~40%): CommercialPanel — announcements, Closing Time, Spotify account
 *
 * Also mounts useExplicitFilter() here (outside both panels) so the hard-block
 * on explicit tracks runs continuously regardless of which panel is active.
 * This hook must be mounted at a level that persists for the app's lifetime.
 *
 * When an announcement is playing (status === "playing"), the Spotify panel
 * is dimmed to 40% opacity and interactions are disabled (pointer-events-none).
 * This visually communicates to staff that the announcement is in control
 * and prevents accidental track changes while it plays.
 *
 * Both panels are loaded with Next.js dynamic() and ssr: false because:
 *   1. The Spotify Web Playback SDK is browser-only (no window on the server)
 *   2. localStorage access (play history, commercial store) requires the browser
 *   3. Prevents hydration mismatches between server and client renders
 */

"use client"

import dynamic from "next/dynamic"
import { useCommercialStore } from "@/lib/commercial-store"
import { useExplicitFilter } from "@/lib/use-explicit-filter"

// Dynamic imports with SSR disabled — required for Spotify SDK and localStorage
const SpotifyPanel = dynamic(() => import("./SpotifyPanel"), { ssr: false })
const CommercialPanel = dynamic(() => import("./CommercialPanel"), { ssr: false })

export default function AppShell() {
  // Mount the explicit filter at app level so it always runs
  useExplicitFilter()

  // Read announcement status to dim/disable the Spotify panel during playback
  const status = useCommercialStore((s) => s.status)
  const isCommercialPlaying = status === "playing"

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Two-panel layout: stacked on mobile, side-by-side on md+ screens */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800">

        {/* Left panel — Spotify controls (~60% width on desktop) */}
        {/* Dimmed and non-interactive when an announcement is playing */}
        <div
          className={`flex-[3] min-h-0 p-6 overflow-y-auto transition-opacity ${
            isCommercialPlaying ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <SpotifyPanel />
        </div>

        {/* Right panel — Announcements, Closing Time, Spotify account (~40% width) */}
        <div className="flex-[2] min-h-0 p-6 overflow-y-auto">
          <CommercialPanel />
        </div>

      </div>
    </div>
  )
}
