/**
 * /admin — Admin dashboard
 *
 * Server component. The admin_session cookie is verified by middleware before
 * this page renders, so authentication is already guaranteed at this point.
 *
 * Sections:
 *   1. Track Analytics — all play events today (Vancouver time), sorted
 *      chronologically. Spotify tracks shown in white; Drive announcements
 *      highlighted in orange with an "Announcement" badge.
 *   2. Admin Users — list of accounts with admin access, plus an invite form
 *      to add new emails. Invites are stored in the admin_users Supabase table
 *      and take effect immediately on the invitee's next login attempt.
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

/** Formats a UTC ISO string as a short date (e.g. "Mar 28"). */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Vancouver",
    month: "short",
    day: "numeric",
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayRow {
  trackId: string
  trackName: string
  artistName: string
  playType: "track" | "announcement"
  playCount: number
  lastPlayed: string   // UTC ISO
  firstPlayed: string  // UTC ISO — used for chronological sort only
}

interface AdminUser {
  email: string
  invited_by: string
  created_at: string
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

  // Fetch all play events for today (Vancouver time), including play_type
  const { gte, lte } = getVancouverTodayRange()
  const { data: plays, error: playsError } = await supabase
    .from("track_plays")
    .select("track_id, track_name, artist_name, play_type, played_at")
    .eq("environment", environment)
    .eq("instance_id", instanceId)
    .gte("played_at", gte)
    .lte("played_at", lte)
    .order("played_at", { ascending: true })

  if (playsError) {
    console.error("[admin] Failed to fetch track plays:", playsError)
  }

  // Fetch all admin users for the invite management section
  const { data: adminUsers, error: adminUsersError } = await supabase
    .from("admin_users")
    .select("email, invited_by, created_at")
    .order("created_at", { ascending: true })

  if (adminUsersError) {
    console.error("[admin] Failed to fetch admin users:", adminUsersError)
  }

  // Aggregate plays: one entry per track_id, counting plays and tracking timestamps
  const playMap = new Map<string, PlayRow>()
  for (const play of plays ?? []) {
    const existing = playMap.get(play.track_id)
    if (existing) {
      existing.playCount++
      if (play.played_at > existing.lastPlayed) existing.lastPlayed = play.played_at
    } else {
      playMap.set(play.track_id, {
        trackId: play.track_id,
        trackName: play.track_name,
        artistName: play.artist_name ?? "",
        playType: play.play_type === "announcement" ? "announcement" : "track",
        playCount: 1,
        lastPlayed: play.played_at,
        firstPlayed: play.played_at,
      })
    }
  }

  // Sort chronologically by first play of each unique item
  const allRows = Array.from(playMap.values()).sort((a, b) =>
    a.firstPlayed.localeCompare(b.firstPlayed)
  )

  const totalPlays = plays?.length ?? 0
  const trackCount = allRows.filter((r) => r.playType === "track").length
  const announcementCount = allRows.filter((r) => r.playType === "announcement").length
  const todayLabel = formatVancouverDate(new Date().toISOString())

  // The owner email (always has access, stored in env var, not necessarily in admin_users table)
  const ownerEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()

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

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── Track Analytics ─────────────────────────────────────────────── */}
        <section className="space-y-6">
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Tracks" value={trackCount.toString()} />
            <StatCard label="Announcements" value={announcementCount.toString()} orange />
            <StatCard label="Total Plays" value={totalPlays.toString()} />
            <StatCard
              label="Most Played"
              value={
                allRows.length > 0
                  ? `${Math.max(...allRows.map((r) => r.playCount))}×`
                  : "—"
              }
            />
          </div>

          {/* Play table — tracks (white) and announcements (orange) interleaved */}
          {allRows.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center">
              <p className="text-zinc-500 text-sm">No plays recorded yet today.</p>
              <p className="text-zinc-600 text-xs mt-1">
                Tracks appear after 5 seconds of playback. Announcements appear when they start.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium w-8">#</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Artist</th>
                    <th className="text-center px-4 py-3 text-zinc-400 font-medium w-24">Plays</th>
                    <th className="text-right px-4 py-3 text-zinc-400 font-medium w-32 hidden sm:table-cell">Last Played</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {allRows.map((row, i) => {
                    const isAnnouncement = row.playType === "announcement"
                    return (
                      <tr
                        key={row.trackId}
                        className={`transition-colors ${
                          isAnnouncement
                            ? "bg-orange-950/20 hover:bg-orange-950/30"
                            : "bg-zinc-950 hover:bg-zinc-900/60"
                        }`}
                      >
                        <td className="px-4 py-3 text-zinc-600 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className={`font-medium truncate max-w-[200px] sm:max-w-none flex items-center gap-2 ${
                            isAnnouncement ? "text-orange-300" : "text-zinc-100"
                          }`}>
                            {row.trackName}
                            {/* Announcement badge — visible on desktop, inline on mobile */}
                            {isAnnouncement && (
                              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/25 tracking-wide uppercase shrink-0">
                                Announcement
                              </span>
                            )}
                          </div>
                          {/* On mobile: show badge below name */}
                          {isAnnouncement && (
                            <span className="sm:hidden inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/25 tracking-wide uppercase">
                              Announcement
                            </span>
                          )}
                          {/* Artist shown inline on mobile for tracks */}
                          {!isAnnouncement && (
                            <div className="text-zinc-500 text-xs mt-0.5 sm:hidden truncate">
                              {row.artistName}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell truncate max-w-[180px]">
                          {isAnnouncement ? (
                            <span className="text-zinc-600 italic">—</span>
                          ) : (
                            row.artistName
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center w-8 h-6 rounded-full text-xs font-semibold tabular-nums ${
                            isAnnouncement
                              ? "bg-orange-500/20 text-orange-400"
                              : row.playCount >= 3
                                ? "bg-orange-500/20 text-orange-400"
                                : "bg-zinc-800 text-zinc-300"
                          }`}>
                            {row.playCount}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right text-xs tabular-nums hidden sm:table-cell ${
                          isAnnouncement ? "text-orange-400/60" : "text-zinc-500"
                        }`}>
                          {formatVancouverTime(row.lastPlayed)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Admin Users ─────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Admin Access</h2>
            <p className="text-zinc-400 text-sm mt-0.5">
              Google accounts with access to this admin panel.
            </p>
          </div>

          {/* Current admins list */}
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Invited By</th>
                  <th className="text-right px-4 py-3 text-zinc-400 font-medium w-28 hidden sm:table-cell">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {/* Owner row — always shown, sourced from env var */}
                <tr className="bg-zinc-950">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-200">{ownerEmail}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-700 text-zinc-400 tracking-wide uppercase">
                        Owner
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 hidden sm:table-cell italic">—</td>
                  <td className="px-4 py-3 text-right text-zinc-600 text-xs hidden sm:table-cell">—</td>
                </tr>
                {/* Invited admin rows from the database */}
                {(adminUsers ?? []).map((u: AdminUser) => (
                  <tr key={u.email} className="bg-zinc-950 hover:bg-zinc-900/60 transition-colors">
                    <td className="px-4 py-3 text-zinc-200">{u.email}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden sm:table-cell truncate max-w-[200px]">
                      {u.invited_by}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500 text-xs hidden sm:table-cell">
                      {formatShortDate(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invite form — server action inserts directly into admin_users */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-5">
            <p className="text-sm font-medium text-zinc-200 mb-1">Invite an admin</p>
            <p className="text-xs text-zinc-500 mb-4">
              Enter a Google account email. The invitee can log in immediately at{" "}
              <span className="text-zinc-400 font-mono">/admin/login</span> — no action required on their end.
            </p>
            <form
              action={async (formData: FormData) => {
                "use server"
                const email = ((formData.get("email") as string) ?? "").trim().toLowerCase()
                if (!email) return

                // Read the caller's email from their admin_session cookie
                const { cookies: getCookies } = await import("next/headers")
                const { jwtVerify } = await import("jose")
                const jar = await getCookies()
                const token = jar.get("admin_session")?.value
                let callerEmail = "unknown"
                if (token) {
                  try {
                    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
                    const { payload } = await jwtVerify(token, secret)
                    callerEmail = (payload.email as string) ?? "unknown"
                  } catch { /* token expired mid-session — callerEmail stays "unknown" */ }
                }

                const { supabase: sb } = await import("@/lib/supabase")
                const { error } = await sb.from("admin_users").insert({
                  email,
                  invited_by: callerEmail,
                })

                if (error && error.code !== "23505") {
                  console.error("[admin/invite] Failed to insert admin user:", error)
                }

                const { revalidatePath } = await import("next/cache")
                revalidatePath("/admin")
              }}
              className="flex gap-2"
            >
              <input
                type="email"
                name="email"
                required
                placeholder="email@example.com"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 min-w-0"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-500/30 hover:border-orange-500/50 transition-colors shrink-0"
              >
                Invite
              </button>
            </form>
          </div>
        </section>

      </div>
    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, orange }: { label: string; value: string; orange?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-4 ${
      orange
        ? "border-orange-500/25 bg-orange-950/20"
        : "border-zinc-800 bg-zinc-900/50"
    }`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
        orange ? "text-orange-500/70" : "text-zinc-500"
      }`}>
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${
        orange ? "text-orange-300" : "text-white"
      }`}>
        {value}
      </p>
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
