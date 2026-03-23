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
