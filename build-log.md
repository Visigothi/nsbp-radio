# NSBP Radio — Build Log

This file is appended after every meaningful action during the build process.
Format: ISO 8601 timestamp | Phase | Action | Result | Notes

---

## 2026-03-19T00:00:00Z | Phase 1: Project Scaffolding

### Action: Install GitHub CLI
- **Result:** Success
- **Notes:** Installed `gh` 2.88.1 via Homebrew. Authenticated as Visigothi via device flow.

### Action: Read build spec
- **Result:** Success
- **Notes:** Read NSBP_Radio_Build_Spec_v1.3.docx. Identified 8 build phases, stack (Next.js + NextAuth.js + Spotify Web Playback SDK + HTML5 Audio + Google Drive API), two commercial playback modes (Queue and Interrupt), and deployment target (Vercel).

### Action: Scaffold Next.js project
- **Command:** `npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes`
- **Result:** Success
- **Notes:** Next.js App Router project created in ~/nsbp-radio with TypeScript and Tailwind CSS.

### Action: Create GitHub repository
- **Command:** `gh repo create nsbp-radio --public --source=. --remote=origin --push`
- **Result:** Success — https://github.com/Visigothi/nsbp-radio
- **Notes:** Initial Next.js scaffold committed and pushed to main branch.

### Action: Create .env.local
- **Result:** Success
- **Notes:** Created with placeholder values for all required environment variables. File is gitignored (.env* pattern in .gitignore). Variables: NEXTAUTH_SECRET, NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS, NEXT_PUBLIC_SPOTIFY_CLIENT_ID, NEXT_PUBLIC_GOOGLE_API_KEY, NEXT_PUBLIC_DEFAULT_DRIVE_FOLDER_ID.

### Action: Create build-log.md
- **Result:** Success
- **Notes:** This file. Will be appended throughout the build.

---

## 2026-03-19T01:00:00Z | Phase 2: Google Authentication Gate

### Action: Install and configure NextAuth.js v5 beta
- **Result:** Success (v5.0.0-beta.30)
- **Notes:** Configured Google provider. Email allowlist enforced in `signIn` callback against `ALLOWED_EMAILS` env var. Returns `false` for unauthorised emails, triggering NextAuth's `AccessDenied` error redirect.

### Action: Create login page
- **Result:** Success — `app/login/page.tsx`
- **Notes:** Minimal dark UI with Google sign-in button. Detects `?error=AccessDenied` query param and shows the spec-specified access denied message instead of the sign-in button.

### Action: Create proxy (middleware) for route protection
- **Result:** Success — `proxy.ts`
- **Notes:** Redirects unauthenticated users to `/login`. Redirects authenticated users away from `/login`. Uses `matcher` to exclude NextAuth API routes and static assets. Next.js 16 uses `proxy.ts` convention (middleware.ts deprecated).

### Action: Create NextAuth route handler
- **Result:** Success — `app/api/auth/[...nextauth]/route.ts`

---

## 2026-03-19T02:00:00Z | Phase 3: Spotify OAuth PKCE Flow

### Action: Implement PKCE auth flow
- **Result:** Success — `lib/spotify-auth.ts`
- **Notes:** Full PKCE implementation using Web Crypto API. Code verifier (128 chars), SHA-256 challenge, base64url encoding. Verifier stored in sessionStorage during auth flow, cleared after token exchange.

### Action: Implement token refresh
- **Result:** Success — `refreshAccessToken()` in `lib/spotify-auth.ts`
- **Notes:** Refreshes 60 seconds before expiry. Called inside `getOAuthToken` callback passed to the Spotify Web Playback SDK.

### Action: Create Spotify callback page
- **Result:** Success — `app/spotify-callback/page.tsx`
- **Notes:** Wraps `useSearchParams` in Suspense as required by Next.js 16 App Router for static page generation compatibility.

### Action: Create Zustand stores
- **Result:** Success — `lib/spotify-store.ts`, `lib/commercial-store.ts`
- **Notes:** Spotify store holds tokens, player instance, device ID, player state. Commercial store holds Drive files, folder ID (persisted to localStorage), queue state, playback status.

---

## 2026-03-19T03:00:00Z | Phase 4: Spotify Playback

### Action: Implement Spotify Web Playback SDK hook
- **Result:** Success — `lib/use-spotify-player.ts`
- **Notes:** Dynamically loads SDK script. Registers ready, not_ready, player_state_changed listeners. Transfers playback to browser device via Web API on ready.

### Action: Build SpotifyPanel component
- **Result:** Success — `app/components/SpotifyPanel.tsx`
- **Notes:** Playlist selector (fetches all playlists via paging), now-playing card with album art, progress bar with 500ms live update interval, transport controls (prev/play-pause/next). Disabled when commercial is playing.

### Action: Build AppShell (two-panel layout)
- **Result:** Success — `app/components/AppShell.tsx`
- **Notes:** Uses dynamic() with ssr: false for both panels (required for Spotify SDK and localStorage access). Responsive: stacks vertically on mobile/tablet, side-by-side on md+.

---

## 2026-03-19T04:00:00Z | Phase 5: Google Drive Integration

### Action: Implement Drive file listing
- **Result:** Success — `lib/drive-api.ts`
- **Notes:** Uses Google Drive API v3 with API Key (no OAuth). Filters by mimeType audio/mpeg. Cleans display names (strip .mp3, replace underscores/hyphens). Folder shared as "Anyone with the link can view".

### Action: Implement folder ID extraction from URL
- **Result:** Success — `extractFolderIdFromUrl()` in `lib/drive-api.ts`
- **Notes:** Handles /folders/ID URLs, ?id= params, and bare IDs.

### Action: Build CommercialPanel with settings drawer
- **Result:** Success — `app/components/CommercialPanel.tsx`
- **Notes:** Settings panel toggle shows folder URL input and Refresh button. Folder ID persisted in localStorage via commercial-store. File cards show Queue and Play Now buttons.

---

## 2026-03-19T05:00:00Z | Phase 6: Commercial Playback Engine

### Action: Implement commercial playback engine
- **Result:** Success — `lib/use-commercial-engine.ts`
- **Notes:**
  - Queue mode: polls playerState every 500ms, triggers at 1500ms remaining. Pauses Spotify, plays MP3 via HTML5 Audio, skips to next track, resumes.
  - Interrupt mode: fades Spotify volume 1 to 0 over 1.5s (30 steps x 50ms), pauses, plays MP3, resumes from captured position, fades 0 to 1 over 1.5s.
  - Skip Commercial button stops audio, restores volume to 1, resumes Spotify.
  - Error recovery: if commercial fails, attempts to restore volume and resume playback.

### Action: Build check
- **Result:** Success — clean production build, all 6 routes generated correctly.

---
