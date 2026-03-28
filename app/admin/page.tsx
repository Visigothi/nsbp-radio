/**
 * /admin — Admin dashboard
 *
 * Server component. The admin_session cookie is verified by middleware before
 * this page renders, so authentication is already guaranteed at this point.
 *
 * Analytics shown: all tracks that received a play event today (Vancouver time),
 * sorted chronologically by their first play of the day. Each row shows:
 *   Track Name · Artist · Play Count · Last Played (Vancouver local time)
 */

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"

// ── Timezone helpers ─────────────────────────────────────────────────────────

/** Returns the UTC ISO range for "today" in America/Vancouver. */
function getVancouverTodayRange(): { gte: string; lte: string } {
  const tz = "America/Vancouver"
  const now = new Date()

  // Get today's date string in Vancouver ("2026-03-28")
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: tz })

  // Resolve the UTC offset currently in effect in Vancouver
  const offsetLabel =
    new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT-7"

  // offsetLabel = "GMT-7" or "GMT-8" etc.
  const match = offsetLabel.match(/GMT([+-])(\d+)/)
  const sign = match?.[1] ?? "-"
  const hours = (match?.[2] ?? "7").padStart(2, "0")
  const tzOffset = `${sign}${hours}:00`

  const gte = new Date(`${dateStr}T00:00:00${tzOffset}`).toISOString()
  const lte = new Date(`${dateStr}T23:59:59.999${tzOffset}`).toISOString()

  return { gte, lte }
}

/** Formats a UTC ISO string as a Vancouver local time (e.g. "3:42 PM"). */
function formatVancouverTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    timeZone: "America/Vancouver",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

/** Formats a UTC ISO string as a Vancouver local date string (e.g. "Saturday, March 28, 2026"). */
function formatVancouverDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Vancouver",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackRow {
  trackId: string
  trackName: string
  artistName: string
  playCount: number
  lastPlayed: string   // UTC ISO
  firstPlayed: string  // UTC ISO — used for chronological sort only
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  // Belt-and-suspenders: middleware already checked the cookie but verify
  // it actually exists in case the page is accessed through an unusual path
  const cookieStore = await cookies()
  if (!cookieStore.has("admin_session")) redirect("/admin/login")

  // DEV-ONLY: filter by environment + instance_id so multiple deployments
  // sharing one Supabase project each see only their own data.
  // TODO (multi-park): replace with one Supabase project per park (Option A)
  // and remove the environment + instance_id columns and these filters.
  const environment = process.env.NODE_ENV === "production" ? "prod" : "dev"
  const instanceId = process.env.INSTANCE_ID ?? "default"

  // Fetch all play events for today (Vancouver time)
  const { gte, lte } = getVancouverTodayRange()
  const { data: plays, error } = await supabase
    .from("track_plays")
    .select("track_id, track_name, artist_name, played_at")
    .eq("environment", environment)
    .eq("instance_id", instanceId)
    .gte("played_at", gte)
    .lte("played_at", lte)
    .order("played_at", { ascending: true })

  if (error) {
    console.error("[admin] Failed to fetch track plays:", error)
  }

  // Aggregate: one entry per track_id, counting plays and tracking timestamps
  const trackMap = new Map<string, TrackRow>()
  for (const play of plays ?? []) {
    const existing = trackMap.get(play.track_id)
    if (existing) {
      existing.playCount++
      if (play.played_at > existing.lastPlayed) existing.lastPlayed = play.played_at
    } else {
      trackMap.set(play.track_id, {
        trackId: play.track_id,
        trackName: play.track_name,
        artistName: play.artist_name,
        playCount: 1,
        lastPlayed: play.played_at,
        firstPlayed: play.played_at,
      })
    }
  }

  // Chronological order (first play of each unique track)
  const tracks = Array.from(trackMap.values()).sort((a, b) =>
    a.firstPlayed.localeCompare(b.firstPlayed)
  )

  const totalPlays = plays?.length ?? 0
  const todayLabel = formatVancouverDate(new Date().toISOString())

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">

      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white tracking-tight">NSBP Radio</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/25 tracking-widest uppercase">
              Admin
            </span>
          </div>
          <form
            action={async () => {
              "use server"
              const { cookies: getCookies } = await import("next/headers")
              const jar = await getCookies()
              jar.delete("admin_session")
              const { redirect: redir } = await import("next/navigation")
              redir("/admin/login")
            }}
          >
            <button
              type="submit"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Page title + refresh */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Track Analytics</h2>
            <p className="text-zinc-400 text-sm mt-0.5">{todayLabel}</p>
          </div>
          <form action="">
            <button
              type="submit"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <RefreshIcon />
              Refresh
            </button>
          </form>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Tracks Played" value={tracks.length.toString()} />
          <StatCard label="Total Plays" value={totalPlays.toString()} />
          <StatCard
            label="Most Played"
            value={
              tracks.length > 0
                ? `${Math.max(...tracks.map((t) => t.playCount))}×`
                : "—"
            }
          />
        </div>

        {/* Track table */}
        {tracks.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
            <p className="text-zinc-500 text-sm">No tracks played yet today.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Play events appear here after a track has been playing for 5 seconds.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Track</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Artist</th>
                  <th className="text-center px-4 py-3 text-zinc-400 font-medium w-24">Plays</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium w-32 hidden sm:table-cell">Last Played</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {tracks.map((track, i) => (
                  <tr
                    key={track.trackId}
                    className="bg-zinc-950 hover:bg-zinc-900/60 transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-600 tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-100 truncate max-w-[200px] sm:max-w-none">
                        {track.trackName}
                      </div>
                      {/* Artist shown inline on mobile only */}
                      <div className="text-zinc-500 text-xs mt-0.5 sm:hidden truncate">
                        {track.artistName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell truncate max-w-[180px]">
                      {track.artistName}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-8 h-6 rounded-full text-xs font-semibold tabular-nums ${
                        track.playCount >= 3
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-zinc-800 text-zinc-300"
                      }`}>
                        {track.playCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500 text-xs tabular-nums hidden sm:table-cell">
                      {formatVancouverTime(track.lastPlayed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-4">
      <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{label}</p>
      <p className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13.65 2.35A8 8 0 1 0 15 8h-1.5a6.5 6.5 0 1 1-1.09-3.58L10 6h5V1l-1.35 1.35z"
        fill="currentColor"
      />
    </svg>
  )
}
