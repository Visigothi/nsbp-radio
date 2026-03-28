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
2. NextAuth completes Google OAuth (admin email is whitelisted via `ADMIN_EMAIL` env var even if not in `ALLOWED_EMAILS`)
3. `/api/admin/verify` checks email against `ADMIN_EMAIL`, mints a signed 1-hour `admin_session` JWT cookie, redirects to `/admin`
4. Middleware (`proxy.ts`) verifies the cookie on every `/admin/*` request

## Analytics

Track play events are written to Supabase (`track_plays` table) when a track has been playing for 5+ seconds (same threshold as the existing localStorage play history). The admin dashboard shows today's plays in Vancouver time, sorted chronologically.

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
| 2 | **User access control** | Manage which Google accounts can log into a given instance of the radio app |
| 3 | **Banned tracks** | Prevent specific Spotify tracks from playing |
| 4 | **Scheduled announcement injection** | Queue Drive MP3s to play automatically at set times |
| 5 | **Private announcements** | Announcements not visible to regular staff |
| 6 | **Remote control** | Control playback (play, pause, skip, volume) from the admin panel |
| 7 | **Historical analytics** | View play history beyond today (7-day, monthly views) |
