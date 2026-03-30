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

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useCommercialStore } from "@/lib/commercial-store"
import { useSpotifyStore } from "@/lib/spotify-store"
import { useThemeStore } from "@/lib/theme-store"
import { useExplicitFilter } from "@/lib/use-explicit-filter"
import { useSkippedFilter } from "@/lib/use-skipped-filter"

// Dynamic imports with SSR disabled — required for Spotify SDK and localStorage
const SpotifyPanel = dynamic(() => import("./SpotifyPanel"), { ssr: false })
const CommercialPanel = dynamic(() => import("./CommercialPanel"), { ssr: false })

export default function AppShell() {
  // Mount both auto-skip filters at app level so they always run
  useExplicitFilter()
  useSkippedFilter()

  // ── Spotify token bridging from URL hash fragment ──
  //
  // The Spotify OAuth callback runs on http://127.0.0.1:3000 (Spotify
  // requires 127.0.0.1 for non-HTTPS redirect URIs) while the main app
  // and NextAuth session live on http://localhost:3000. These are different
  // browser origins, so cookies and storage are NOT shared between them.
  //
  // To bridge the gap, the callback page (app/spotify-callback/page.tsx)
  // base64-encodes the tokens into a URL hash fragment and redirects here:
  //   http://localhost:3000/#spotify_tokens=<base64-encoded JSON>
  //
  // This effect runs once on mount, checks for that hash fragment, decodes
  // the tokens, stores them in the Zustand spotify-store (in-memory only),
  // and removes the hash from the URL to keep it clean. Hash fragments are
  // never sent to the server, so tokens remain client-side only.
  const setTokens = useSpotifyStore((s) => s.setTokens)
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes("spotify_tokens=")) {
      try {
        const encoded = hash.split("spotify_tokens=")[1]
        const tokens = JSON.parse(atob(encoded))
        setTokens(tokens)
        // Remove the hash fragment without triggering a page reload or
        // adding a new entry to the browser's history stack.
        history.replaceState(null, "", window.location.pathname)
      } catch (err) {
        console.error("Failed to parse Spotify tokens from URL hash:", err)
      }
    }
  }, [setTokens])

  // Apply data-theme attribute to <html> so CSS variable overrides in globals.css take effect
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
  }, [theme])

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
          className={`flex-[3] min-h-0 overflow-y-auto transition-opacity ${
            isCommercialPlaying ? "opacity-40 pointer-events-none" : ""
          }`}
          style={{ padding: "var(--layout-inset)" }}
        >
          <SpotifyPanel />
        </div>

        {/* Right panel — Announcements, Closing Time, Spotify account (~40% width) */}
        <div className="flex-[2] min-h-0 overflow-y-auto" style={{ padding: "var(--layout-inset)" }}>
          <CommercialPanel />
        </div>

      </div>
    </div>
  )
}
