<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# OAuth Development Environment Setup

This app uses two separate OAuth providers that require different origins in development, which creates a cross-origin challenge. Understanding this setup is essential before touching any auth-related code.

## The Dual-Origin Problem

| Provider | Dev Origin | Why |
|---|---|---|
| **Google (NextAuth v5)** | `http://localhost:3000` | Google Cloud Console redirect URIs use localhost. The NextAuth session cookie is bound to this origin. |
| **Spotify (PKCE)** | `http://127.0.0.1:3000` | Spotify's API rejects `localhost` for non-HTTPS redirect URIs but accepts `127.0.0.1`. |

Browsers treat `localhost` and `127.0.0.1` as **separate origins**. Cookies, localStorage, and sessionStorage are NOT shared between them. This means:
- The NextAuth session cookie (set on localhost) is invisible on 127.0.0.1.
- Any data stored in localStorage/sessionStorage on one origin cannot be read on the other.

## Token Bridging Strategy (Hash Fragment)

After Spotify redirects to `http://127.0.0.1:3000/spotify-callback`, the callback page exchanges the auth code for tokens, then needs to get those tokens back to the localhost origin. The solution:

1. `app/spotify-callback/page.tsx` base64-encodes the tokens into a **URL hash fragment**.
2. It redirects the browser to `http://localhost:3000/#spotify_tokens=<base64>`.
3. `app/components/AppShell.tsx` reads the hash on mount, stores tokens in the Zustand store (in-memory), and clears the hash.

Hash fragments (`#...`) are never sent to the server in HTTP requests, so tokens stay client-side only. This is safer than query parameters, which appear in server logs and Referer headers.

## PKCE Verifier via OAuth State Parameter

Standard PKCE flows store the `code_verifier` in sessionStorage before redirecting to the provider. That does not work here because the flow starts on localhost but the callback returns on 127.0.0.1 — sessionStorage is not shared across origins.

Instead, the verifier is base64-encoded into the OAuth `state` parameter:
- `lib/spotify-auth.ts` → `initiateSpotifyAuth()` encodes the verifier as `btoa(verifier)` into `state`.
- Spotify echoes `state` back unchanged in the callback URL's `?state=` query param.
- `exchangeCodeForToken(code, state)` decodes the verifier with `atob(state)`.

## Required Dashboard Configuration

### Google Cloud Console
- **Authorized redirect URI:** `http://localhost:3000/api/auth/callback/google`
- Do NOT add 127.0.0.1 — Google OAuth only uses the localhost origin.

### Spotify Developer Dashboard
- **Redirect URI:** `http://127.0.0.1:3000/spotify-callback`
- Do NOT add localhost — Spotify rejects localhost over plain HTTP.
- The connecting user must be added as a **Development User** in the Dashboard (or the app must be in Extended Quota Mode) for API calls to work.

## AUTH_SECRET vs NEXTAUTH_SECRET

This project uses **NextAuth v5** (Auth.js). The session signing key is `AUTH_SECRET`, not `NEXTAUTH_SECRET`. NextAuth v5 ignores `NEXTAUTH_SECRET` entirely. If you see the older name in documentation or examples, it does not apply here. Generate a new secret with `npx auth secret`.

## allowedDevOrigins (next.config.ts)

The `allowedDevOrigins: ["127.0.0.1"]` setting in `next.config.ts` tells the Next.js dev server to accept requests originating from the 127.0.0.1 origin. Without this, Next.js blocks the cross-origin redirect from the Spotify callback (127.0.0.1) back to the app (localhost) during development. This setting has no effect in production builds.

## Middleware Exclusion (proxy.ts)

The `/spotify-callback` route is excluded from the auth middleware matcher. Because this route loads on the 127.0.0.1 origin, the NextAuth session cookie (bound to localhost) is not present. Without the exclusion, the middleware would redirect the callback to `/login`, breaking the Spotify OAuth flow.

## Key Files

| File | Role |
|---|---|
| `lib/spotify-auth.ts` | PKCE flow: verifier generation, state encoding, token exchange, refresh |
| `app/spotify-callback/page.tsx` | Callback handler on 127.0.0.1; token bridging redirect to localhost |
| `app/components/AppShell.tsx` | Reads tokens from URL hash fragment on localhost |
| `proxy.ts` | Auth middleware; excludes spotify-callback from protection |
| `next.config.ts` | allowedDevOrigins for 127.0.0.1 cross-origin support |
| `.env.local` | All OAuth secrets and redirect URIs with origin explanations |

## Deployment Guidelines

### Never hardcode origins or hostnames

Always derive URLs from `window.location.origin`, environment variables, or `NEXTAUTH_URL`. Never use `localhost` or `127.0.0.1` in production code paths. Those strings should only appear inside dev-only branches guarded by environment detection.

### Pre-deploy checklist

Before running `vercel --prod`:

1. Verify all new `NEXT_PUBLIC_*` env vars exist in the Vercel dashboard (Settings → Environment Variables).
2. Verify no `localhost` or `127.0.0.1` strings exist in production code paths — use environment detection instead.
3. Verify any new OAuth redirect URIs are registered in the relevant dashboard (Google Cloud Console, Spotify Developer Dashboard).
4. Test the build locally with `npx next build` before deploying.

### Environment-aware code patterns

- Use `process.env.NODE_ENV` or origin detection (`window.location.hostname === "127.0.0.1"`) to branch dev vs prod behaviour.
- Use `.env.local` for dev-only values; Vercel dashboard env vars for production.
- `NEXT_PUBLIC_*` vars are baked into the client bundle at build time — changing them in Vercel requires a redeploy.

### Current production environment variables

| Variable | Value / Notes |
|---|---|
| `AUTH_SECRET` | (secret) |
| `NEXTAUTH_URL` | `https://nsbp-radio.vercel.app` |
| `GOOGLE_CLIENT_ID` | (secret) |
| `GOOGLE_CLIENT_SECRET` | (secret) |
| `ALLOWED_EMAILS` | (secret) |
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` | (public) |
| `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` | `https://nsbp-radio.vercel.app/spotify-callback` |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | (public) |
| `NEXT_PUBLIC_DEFAULT_DRIVE_FOLDER_ID` | (public) |
| `SUPABASE_URL` | `https://frbqjdmpdashtgropoip.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret) |
| `ADMIN_EMAIL` | `mike@westcoastbikeparks.ca` (park production) |
| `INSTANCE_ID` | `nsbp` (park production) |

---

# Admin Layer

The app has a separate admin panel at `/admin` protected by its own session cookie (independent of the staff NextAuth session).

## Admin Auth Flow

1. Admin visits `/admin/login` → clicks Sign in with Google
2. NextAuth completes Google OAuth (admin email is allowed even if not in `ALLOWED_EMAILS`)
3. `/api/admin/verify` checks the email against **both** the `ADMIN_EMAIL` env var and the `admin_users` Supabase table — either match grants access
4. On success, a signed 1-hour `admin_session` JWT cookie is minted and the user is redirected to `/admin`
5. Middleware (`proxy.ts`) verifies the cookie on every `/admin/*` request
6. `auth.ts` also checks `admin_users` so invited admins can sign in to the staff radio app without being in `ALLOWED_EMAILS`

## Admin Access Management

Admins can invite other Google accounts to the admin panel from the **Admin Access** tab in the dashboard:

- The owner email (`ADMIN_EMAIL` env var) always has access and appears at the top of the list with an "Owner" badge
- Invited admins are stored in the `admin_users` Supabase table (`email`, `invited_by`, `created_at`)
- Invites take effect immediately on the invitee's next login attempt — no email or action required on their end
- The invite form submits via a Next.js Server Action that reads the caller's `admin_session` cookie to record `invited_by`

### `admin_users` table schema

```sql
CREATE TABLE admin_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  role        TEXT NOT NULL DEFAULT 'admin'  -- 'admin' or 'owner'
);
```

## Analytics

Track play events are written to Supabase (`track_plays` table) when a track has been playing for 5+ seconds. Drive announcement plays are recorded immediately when playback begins (no delay threshold). The admin dashboard shows today's plays in Vancouver time, sorted chronologically by first play.

Both tracks and announcements appear in the same table, distinguished by the `play_type` column:

| `play_type` | Source | Dashboard display |
|---|---|---|
| `track` | Spotify Web Playback SDK | White row, artist shown |
| `announcement` | Drive MP3 via Web Audio API | Orange row, "Announcement" badge, artist column blank |

### `track_plays` table schema (relevant columns)

| Column | Type | Notes |
|---|---|---|
| `track_id` | text | Spotify track ID or Drive file ID |
| `track_name` | text | Display name |
| `artist_name` | text | Spotify artist(s); empty string for announcements |
| `play_type` | text | `'track'` (default) or `'announcement'` |
| `played_at` | timestamptz | UTC timestamp of playback start |
| `environment` | text | `'dev'` or `'prod'` |
| `instance_id` | text | e.g. `'nsbp'` |

## Admin Dashboard UI

The dashboard at `/admin` uses a tab layout (client component `AdminTabs.tsx`) with all data fetched server-side in `page.tsx` and passed as props — tab switching is instant with no additional network requests.

| Tab | Contents |
|---|---|
| **Track Analytics** | Stat cards (Tracks, Announcements, Total Plays, Most Played) + chronological play table with orange announcement rows + Refresh button |
| **Admin Access** | Admin users table (owner row + invited rows) + invite form |

## Multi-Instance Isolation (Temporary)

Currently all deployments share one Supabase project. Two columns tag every row to prevent analytics from mixing across deployments:

| Column | Values | Purpose |
|---|---|---|
| `environment` | `dev` / `prod` | Separates local dev plays from production plays |
| `instance_id` | e.g. `nsbp`, `personal-dev` | Separates different park deployments |

**This is a temporary approach.** See the backlog item below for the production-ready solution.

---

# Admin Backlog

Features planned but not yet built, in rough priority order.

| # | Feature | Notes |
|---|---|---|
| 1 | **Multi-park / multi-tenant architecture** | Current `environment` + `instance_id` column approach is a temporary workaround. Production solution: one Supabase project per park (Option A). Each Vercel deployment gets its own `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Remove `environment` and `instance_id` columns from `track_plays` at that time. |
| 2 | **Staff user access control** | Manage which Google accounts can log into the *radio app itself* (currently controlled by the `ALLOWED_EMAILS` env var — no UI). Note: admin panel access is already manageable via the Admin Access tab. |
| 3 | **Banned tracks** | Prevent specific Spotify tracks from playing |
| 4 | **Scheduled announcement injection** | Queue Drive MP3s to play automatically at set times |
| 5 | **Private announcements** | Announcements not visible to regular staff |
| 6 | **Remote control** | Control playback (play, pause, skip, volume) from the admin panel |
| 7 | **Historical analytics** | View play history beyond today (7-day, monthly views) |

## Recently Shipped (v1.6.4)

| Feature | Details |
|---|---|
| **Spotify logout bug fix** | Fixed random Spotify logouts caused by player being destroyed and recreated on every token refresh. The `useEffect` in `use-spotify-player.ts` previously depended on the full `tokens` object, so `setTokens()` after a refresh triggered cleanup (`player.disconnect()`) and player recreation. Fix: effect now depends on `isConnected` (boolean) only; a `tokensRef` keeps `getOAuthToken` supplied with current tokens without causing re-runs. |
| **Stale closure fix** | `getOAuthToken` previously captured `tokens` from the closure at player-creation time. It now reads from `tokensRef.current` so it always uses the latest token, including mid-session refreshes. |
| **Spotify debug logging** | Added `[Spotify]`-prefixed console logs throughout `use-spotify-player.ts`: `getOAuthToken` calls with time-to-expiry, refresh success/failure with new expiry timestamp, `ready`/`not_ready` events, null `player_state_changed` (playback dropped), and `authentication_error`. |

## Recently Shipped (v1.6.3)

| Feature | Details |
|---|---|
| **UI Themes** | Three selectable themes in Settings → Theme dropdown: North Shore (default — dark/black, warm orange), Mackenzie (pink accent palette, bright pink section headers and Now Playing border), Eli (bold black, bright `#FF9000` orange, 3px thick borders, peach `#FFCBA4` Now Playing fill). Theme persisted to localStorage via `lib/theme-store.ts` (Zustand). Applied as `data-theme` on `<html>` by AppShell.tsx. |
| **Theme-aware CSS system** | CSS custom property overrides in `globals.css` per `[data-theme]` selector. `--color-orange-*` vars replaced per theme, switching all Tailwind `orange-*` utilities automatically. Blob vars, Now Playing border/width/bg, section headers (`.theme-header`), and button borders all theme-aware. |
| **Eli theme button styling** | Skip, Queue, and Play Now buttons in Eli theme render with 3px solid `#FF9000` border, black background, bold white text. Queue/Play Now buttons gained `border border-zinc-700` class so the `button[class*="border"]` CSS rule applies. Eli rule also overrides `background: #000`. |

## Recently Shipped (v1.6.2)

| Feature | Details |
|---|---|
| **Remove admin** | Owner can remove any invited admin via a Remove button (with confirmation dialog). Owner cannot remove themselves. |
| **Transfer ownership** | Owner can promote any admin to Owner via a role dropdown (with confirmation dialog). Previous owner is demoted to Admin. Only one Owner at a time. Non-owners cannot see or use these controls. |
| **Role column in admin_users** | `role TEXT NOT NULL DEFAULT 'admin'` column added to `admin_users` table. DB `role='owner'` takes precedence over `ADMIN_EMAIL` env var for owner resolution; env var remains as bootstrap fallback. |

## Recently Shipped (v1.6.1)

| Feature | Details |
|---|---|
| **Announcement analytics** | Drive MP3 announcements are tracked in `track_plays` with `play_type = 'announcement'`; displayed in orange in the admin dashboard |
| **Admin invite system** | Admin Access tab in the dashboard — invite Google accounts to the admin panel via `admin_users` table; takes effect immediately |
| **Admin dashboard tab UI** | Track Analytics and Admin Access are now tabs (client component `AdminTabs.tsx`); data is all server-fetched, tab switching is instant |
| **Browser tab title** | `/admin` now shows "NSBP Radio Administrator" in the browser tab via Next.js `metadata` export |
