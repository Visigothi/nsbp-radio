/**
 * /admin — Admin dashboard
 *
 * Server component. The admin_session cookie is verified by middleware before
 * this page renders, so authentication is already guaranteed at this point.
 *
 * All data is fetched here server-side and passed to AdminTabs (a client
 * component) so tab switching is instant with no additional network requests.
 *
 * Tabs:
 *   1. Track Analytics — all play events today (Vancouver time), sorted
 *      chronologically. Spotify tracks shown in white; Drive announcements
 *      highlighted in orange with an "Announcement" badge.
 *   2. Admin Access — list of accounts with admin access, plus an invite form
 *      to add new emails. Invites are stored in the admin_users Supabase table
 *      and take effect immediately on the invitee's next login attempt.
 */

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import AdminTabs from "./AdminTabs"

export const metadata = { title: "NSBP Radio Administrator" }

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
  const todayLabel = formatVancouverDate(new Date().toISOString())

  // The owner email (always has access, stored in env var, not necessarily in admin_users table)
  const ownerEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()

  // Server action for the invite form — reads the caller's admin_session cookie,
  // then inserts the new email into the admin_users table. Passed as a prop to
  // AdminTabs so the client component can wire it to the <form action={...}>.
  async function inviteAction(formData: FormData) {
    "use server"
    const email = ((formData.get("email") as string) ?? "").trim().toLowerCase()
    if (!email) return

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
  }

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

      <div className="max-w-5xl mx-auto px-6 py-8">
        <AdminTabs
          allRows={allRows}
          totalPlays={totalPlays}
          todayLabel={todayLabel}
          adminUsers={adminUsers ?? []}
          ownerEmail={ownerEmail}
          inviteAction={inviteAction}
        />
      </div>
    </main>
  )
}
