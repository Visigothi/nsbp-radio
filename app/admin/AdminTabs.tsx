"use client"

/**
 * AdminTabs.tsx — Tab switcher for the admin dashboard
 *
 * Client component that manages which tab is active (Analytics vs Admin Access).
 * All data is fetched server-side in page.tsx and passed down as props so the
 * tab switch is instant with no additional network requests.
 */

import { useState } from "react"

// ── Types passed in from the server page ─────────────────────────────────────

export interface PlayRow {
  trackId: string
  trackName: string
  artistName: string
  playType: "track" | "announcement"
  playCount: number
  lastPlayed: string
  firstPlayed: string
}

export interface AdminUser {
  email: string
  invited_by: string
  created_at: string
}

interface AdminTabsProps {
  allRows: PlayRow[]
  totalPlays: number
  todayLabel: string
  adminUsers: AdminUser[]
  ownerEmail: string
  /** Server action passed through from page.tsx for the invite form */
  inviteAction: (formData: FormData) => Promise<void>
}

type Tab = "analytics" | "access"

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminTabs({
  allRows,
  totalPlays,
  todayLabel,
  adminUsers,
  ownerEmail,
  inviteAction,
}: AdminTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("analytics")

  const trackCount = allRows.filter((r) => r.playType === "track").length
  const announcementCount = allRows.filter((r) => r.playType === "announcement").length

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        <TabButton
          label="Track Analytics"
          active={activeTab === "analytics"}
          onClick={() => setActiveTab("analytics")}
        />
        <TabButton
          label="Admin Access"
          active={activeTab === "access"}
          onClick={() => setActiveTab("access")}
        />
      </div>

      {/* ── Analytics tab ──────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Track Analytics</h2>
              <p className="text-zinc-400 text-sm mt-0.5">{todayLabel}</p>
            </div>
            {/* Refresh reloads the full page to re-fetch server data */}
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <RefreshIcon />
              Refresh
            </button>
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

          {/* Play table */}
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
                            {isAnnouncement && (
                              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/25 tracking-wide uppercase shrink-0">
                                Announcement
                              </span>
                            )}
                          </div>
                          {isAnnouncement && (
                            <span className="sm:hidden inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/25 tracking-wide uppercase">
                              Announcement
                            </span>
                          )}
                          {!isAnnouncement && (
                            <div className="text-zinc-500 text-xs mt-0.5 sm:hidden truncate">
                              {row.artistName}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell truncate max-w-[180px]">
                          {isAnnouncement ? <span className="text-zinc-600 italic">—</span> : row.artistName}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center w-8 h-6 rounded-full text-xs font-semibold tabular-nums ${
                            isAnnouncement || row.playCount >= 3
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
        </div>
      )}

      {/* ── Admin Access tab ───────────────────────────────────────────────── */}
      {activeTab === "access" && (
        <div className="space-y-4">
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
                {adminUsers.map((u) => (
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

          {/* Invite form */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-5">
            <p className="text-sm font-medium text-zinc-200 mb-1">Invite an admin</p>
            <p className="text-xs text-zinc-500 mb-4">
              Enter a Google account email. The invitee can log in immediately at{" "}
              <span className="text-zinc-400 font-mono">/admin/login</span> — no action required on their end.
            </p>
            <form action={inviteAction} className="flex gap-2">
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
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-orange-500 text-white"
          : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
      }`}
    >
      {label}
    </button>
  )
}

function StatCard({ label, value, orange }: { label: string; value: string; orange?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-4 ${
      orange ? "border-orange-500/25 bg-orange-950/20" : "border-zinc-800 bg-zinc-900/50"
    }`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
        orange ? "text-orange-500/70" : "text-zinc-500"
      }`}>
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums ${orange ? "text-orange-300" : "text-white"}`}>
        {value}
      </p>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M13.65 2.35A8 8 0 1 0 15 8h-1.5a6.5 6.5 0 1 1-1.09-3.58L10 6h5V1l-1.35 1.35z" fill="currentColor" />
    </svg>
  )
}

// ── Formatting helpers (duplicated from page.tsx for client-side use) ─────────

function formatVancouverTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", {
    timeZone: "America/Vancouver",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: "America/Vancouver",
    month: "short",
    day: "numeric",
  })
}
