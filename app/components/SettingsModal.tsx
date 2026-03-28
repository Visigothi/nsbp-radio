"use client"

/**
 * SettingsModal.tsx — Gear icon button + settings modal dialog
 *
 * Renders a gear icon in the header. Clicking it opens a modal overlay with:
 *   - App version number
 *   - Google account (email + Sign Out button, using a Server Action passed as prop)
 *   - Announcement Volume slider (50%–200%, persisted via commercial store / localStorage)
 *   - Spotify account section (connect / switch / disconnect)
 *
 * The signOutAction prop is a Next.js Server Action defined in page.tsx and
 * passed down here. Server Actions can be serialized and passed as props to
 * Client Components in Next.js App Router.
 *
 * The modal closes when the user clicks the backdrop or the × button.
 * ESC key support is omitted for simplicity — backdrop click suffices.
 */

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import SpotifyAccountSection from "./SpotifyAccountSection"
import { useCommercialStore } from "@/lib/commercial-store"

/** Current app version — update this whenever a significant change is deployed */
export const APP_VERSION = "v1.6.0 BETA"

interface SettingsModalProps {
  /** Google account email shown in the Google Account section */
  email?: string | null
  /** Server Action that signs the user out of Google (NextAuth) and redirects to /login */
  signOutAction: () => Promise<void>
}

export default function SettingsModal({ email, signOutAction }: SettingsModalProps) {
  const [open, setOpen] = useState(false)
  const {
    announcementGain, setAnnouncementGain,
    autoSkipEnabled, setAutoSkipEnabled,
    autoSkipThreshold, setAutoSkipThreshold,
  } = useCommercialStore()

  return (
    <>
      {/* Gear icon button — sits in the header top-right */}
      <button
        onClick={() => setOpen(true)}
        className="text-zinc-500 hover:text-white transition-colors"
        title="Settings"
        aria-label="Open settings"
      >
        <GearIcon />
      </button>

      {/* Modal overlay — rendered via portal to escape header's stacking context (backdropFilter creates a new containing block that traps fixed positioning) */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop — click to close */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog panel — max height keeps it within the viewport; overflow-y scrolls internally */}
          <div
            className="relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl overflow-y-auto"
            style={{
              background: "rgba(18,18,18,0.97)",
              border: "1px solid rgba(255,157,26,0.25)",
              maxHeight: "calc(100vh - 2rem)",
            }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                Settings
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
                aria-label="Close settings"
              >
                <CloseIcon />
              </button>
            </div>

            {/* ── App Version ────────────────────────────────────────────── */}
            <Section label="App Version">
              <p className="text-sm text-zinc-300 font-mono">{APP_VERSION}</p>
            </Section>

            {/* ── Google Account ─────────────────────────────────────────── */}
            <Section label="Google Account">
              <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2.5 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-300 truncate">{email ?? "—"}</p>
                {/*
                  signOutAction is a Server Action from page.tsx.
                  Wrapping it in a <form> is the standard Next.js pattern for
                  invoking Server Actions from Client Components.
                */}
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors shrink-0"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </Section>

            {/* ── Announcement Volume ────────────────────────────────────── */}
            {/*
              The HTML <audio> element's .volume is capped at 1.0 — it cannot
              amplify beyond the source recording level. We route audio through a
              Web Audio API GainNode (in use-commercial-engine.ts) which supports
              gain > 1.0, allowing quiet announcement files to be boosted.
              Range: 50% (half) to 200% (double). Default: 100% (unchanged).
            */}
            <Section label="Announcement Volume">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={Math.round(announcementGain * 100)}
                  onChange={(e) => setAnnouncementGain(parseInt(e.target.value) / 100)}
                  className="flex-1"
                  style={{ accentColor: "var(--brand-orange)" }}
                />
                <span className="text-sm text-zinc-300 tabular-nums w-12 text-right">
                  {Math.round(announcementGain * 100)}%
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">
                Boost quiet announcements. 100% = original level, 200% = double amplitude.
              </p>
            </Section>

            {/* ── Playback Rules (HIDDEN — auto-skip needs further testing) ── */}
            {/*
              Auto-skip by play count. When enabled, any track whose today-play-count
              meets or exceeds the threshold is automatically skipped during playback
              (via useSkippedFilter) and dimmed in the Up Next queue in real time.
              Threshold 5 means "5 or more times".

              HIDDEN: This feature causes a skip cascade where tracks are rapidly
              skipped 1-2 seconds in, inflating play counts and making the player
              unusable. The 5-second recording delay in use-play-history.ts and the
              2-second cooldown in use-skipped-filter.ts mitigate but don't fully
              solve the issue. Uncomment this section once the root cause is resolved.
            */}
            {/*
            <Section label="Playback Rules">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="auto-skip-toggle"
                  checked={autoSkipEnabled}
                  onChange={(e) => setAutoSkipEnabled(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: "var(--brand-orange)" }}
                />
                <label
                  htmlFor="auto-skip-toggle"
                  className="text-sm text-zinc-300 cursor-pointer select-none"
                >
                  Skip tracks played more than
                </label>
                <select
                  value={autoSkipThreshold}
                  onChange={(e) => setAutoSkipThreshold(parseInt(e.target.value))}
                  disabled={!autoSkipEnabled}
                  className="bg-zinc-800 border border-zinc-700 text-white rounded px-2 py-1 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ accentColor: "var(--brand-orange)" }}
                >
                  <option value={1}>1 Time</option>
                  <option value={2}>2 Times</option>
                  <option value={3}>3 Times</option>
                  <option value={4}>4 Times</option>
                  <option value={5}>5+ Times</option>
                </select>
                <span className="text-sm text-zinc-500">today</span>
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">
                Overplayed tracks will be dimmed in Up Next and auto-skipped during playback.
              </p>
            </Section>
            */}

            {/* ── Spotify Account ────────────────────────────────────────── */}
            {/*
              SpotifyAccountSection renders its own heading and content.
              It handles Connect / Switch Account / Disconnect internally
              via the Spotify auth flow (PKCE OAuth).
            */}
            <SpotifyAccountSection />

            {/* ── Admin Panel ────────────────────────────────────────────── */}
            {/*
              Opens the admin dashboard in a new tab. The admin panel uses its
              own independent session (admin_session JWT cookie) separate from
              the staff NextAuth session — no cross-contamination between the
              two auth layers.
            */}
            <Section label="Admin">
              <a
                href="/admin"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/50 transition-colors"
              >
                <ShieldIcon />
                Open Admin Panel
                <ExternalLinkIcon />
              </a>
              <p className="text-xs text-zinc-600 mt-1.5">Opens in a new tab · Admin login required</p>
            </Section>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Labelled section block used to group related settings */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
        {label}
      </p>
      {children}
    </div>
  )
}

function GearIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
    </svg>
  )
}
