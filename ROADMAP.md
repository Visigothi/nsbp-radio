# Roadmap

## Target Architecture

The radio app running in the park browser is a **"dumb player"** that takes direction from Supabase. The admin panel is the **"control plane"** that writes configuration and commands to Supabase. The park browser subscribes to changes and reacts. Each park has its own Supabase project — no shared tables, no `instance_id` columns.

All admin-to-park communication flows through Supabase. The admin browser never communicates directly with the park browser.

---

## Phased Backlog

Phases are ordered so each builds on the previous. Do not skip ahead — later phases depend on infrastructure established in earlier ones.

### Phase 1 — Multi-park architecture

**Goal:** Each park deployment gets its own Supabase project. Remove the temporary `environment` + `instance_id` column workaround.

| Task | Details |
|------|---------|
| Provision per-park Supabase projects | Each park gets its own `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` via Vercel env vars |
| Remove `environment` and `instance_id` columns | Drop from `track_plays` and any future tables — isolation is handled at the project level |
| Update all Supabase queries | Remove `environment`/`instance_id` filters from `app/api/track-play/route.ts` and `app/admin/page.tsx` |
| Update AGENTS.md | Remove the "Multi-Instance Isolation (Temporary)" section once migration is complete |

**Why first:** Doing this before adding new tables/features means all subsequent work is built on clean architecture. No throwaway `instance_id` channel namespacing or column filtering.

### Phase 2 — Admin CRUD features

**Goal:** Give admins control over staff access, track banning, and historical data. These features only need new admin tabs and Supabase tables — no Realtime required.

| Task | Details |
|------|---------|
| Staff access control UI | New admin tab to manage which Google accounts can log into the radio app (replaces `ALLOWED_EMAILS` env var). New `allowed_staff` Supabase table. `auth.ts` reads from table instead of env var. |
| Banned tracks | New admin tab to add/remove banned Spotify tracks. New `banned_tracks` Supabase table. Park browser reads the ban list on page load and filters the queue client-side. |
| Historical analytics | Extend the Track Analytics tab with date range selectors (7-day, 30-day views). No new tables — queries against existing `track_plays` with date filters. |

**Pattern to follow:** The Admin Access tab (`AdminTabs.tsx`, server actions in `app/admin/page.tsx`) is the template. Server action for insert/delete, Supabase table, new tab entry, server-side data fetch passed as props.

### Phase 3 — Supabase Realtime + live features

**Goal:** Enable real-time communication between the admin panel and the park browser. This is the foundation for remote control, live status, and reactive features.

| Task | Details |
|------|---------|
| Browser-side Supabase client | Create `lib/supabase-browser.ts` with `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key, client-side). Write RLS policies for tables the park browser subscribes to. The existing `lib/supabase.ts` (service_role, server-only) stays untouched. |
| Live status indicator | Park browser sends periodic heartbeat via Supabase Realtime Presence. Admin dashboard shows online/offline status and current track. |
| Remote control | Admin publishes commands (play, pause, skip, volume) via Supabase Realtime Broadcast on a per-park channel. Park browser subscribes and dispatches to the Spotify player instance (`lib/spotify-store.ts`). No persistence needed — commands are fire-and-forget. |
| Banned tracks — live enforcement | Upgrade from Phase 2: subscribe to `banned_tracks` Postgres Changes so a newly banned track is skipped mid-session without page reload. |
| Scheduled announcement injection | Admin sets schedules in an `announcement_schedule` Supabase table. Park browser subscribes via Postgres Changes or polls every 30s. |

**Key infrastructure decisions (already made):**

- **Supabase Realtime**, not polling or SSE. Polling adds latency for remote control; SSE is incompatible with Vercel's serverless model (function timeout limits).
- **Broadcast** for remote control commands (fire-and-forget, no persistence). **Postgres Changes** for table subscriptions (banned tracks, schedules) where persistence matters.
- New env var required: `NEXT_PUBLIC_SUPABASE_ANON_KEY` — must be added to `.env.local` and Vercel dashboard before any Phase 3 work ships.

### Phase 4 — Nice-to-haves

| Task | Details |
|------|---------|
| Private announcements | Visibility column on Drive file metadata in Supabase. Depends on Phase 3 Realtime client for live filtering. Low priority — the owner can control visibility by managing the shared Drive folder directly. |

---

## Key Architectural Decisions

These decisions are made and should not be revisited without strong justification.

| Decision | Rationale |
|----------|-----------|
| **Supabase Realtime for admin↔park communication** | Already have `@supabase/supabase-js`. No new dependencies. Broadcast for commands, Postgres Changes for table subscriptions. |
| **Separate browser-side Supabase client** | `lib/supabase.ts` uses service_role key (server-only). `lib/supabase-browser.ts` will use anon key with RLS. Never mix them. |
| **One Supabase project per park** | Cleanest isolation. No column-based filtering. Each Vercel deployment points to its own project via env vars. |
| **No direct browser-to-browser communication** | All data flows through Supabase. No WebRTC, postMessage, or other direct channels between admin and park browsers. |
