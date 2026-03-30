/**
 * spotify-auth.ts — Spotify OAuth PKCE flow (client-side)
 *
 * Implements the Spotify Authorization Code with PKCE flow.
 * PKCE (Proof Key for Code Exchange) is used instead of a client secret
 * because this code runs in the browser and secrets can't be kept safe there.
 *
 * Flow overview:
 *   1. initiateSpotifyAuth() — generates a random code_verifier, hashes it
 *      into a code_challenge, base64-encodes the verifier into the OAuth
 *      `state` parameter, then redirects to Spotify's /authorize endpoint.
 *   2. Spotify redirects back to /spotify-callback with ?code= and ?state=
 *      query params. The callback page runs on 127.0.0.1 (Spotify's
 *      redirect URI requirement for non-HTTPS dev environments).
 *   3. exchangeCodeForToken() — decodes the verifier from the `state` param
 *      and sends code + verifier to Spotify's /api/token endpoint to get
 *      access + refresh tokens.
 *   4. The callback page encodes tokens into a URL hash fragment and
 *      redirects from 127.0.0.1 to localhost:3000 to bridge the origin gap
 *      (the NextAuth session cookie is bound to localhost).
 *   5. AppShell.tsx reads tokens from the hash fragment, stores them in the
 *      Zustand spotify-store (in memory only), and clears the hash.
 *      Tokens are NOT persisted to localStorage — each page load requires
 *      re-authentication via the Connect Spotify button.
 *   6. refreshAccessToken() is called by use-spotify-player.ts when the
 *      access token is within 60 seconds of expiry.
 *
 * Why the state parameter instead of sessionStorage/localStorage?
 *   The OAuth flow crosses origins: it starts on localhost:3000, Spotify
 *   redirects back to 127.0.0.1:3000. Even though these resolve to the
 *   same machine, browsers treat them as different origins — localStorage
 *   and sessionStorage are NOT shared between them. Encoding the verifier
 *   in the OAuth `state` parameter avoids any storage-based origin issues.
 *   Spotify echoes the `state` value back unchanged on the callback URL.
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SPOTIFY_CLIENT_ID    — from the Spotify Developer Dashboard
 *   NEXT_PUBLIC_SPOTIFY_REDIRECT_URI — must exactly match a URI registered in the Dashboard
 *     Dev:  http://127.0.0.1:3000/spotify-callback
 *     Prod: https://yourdomain.com/spotify-callback
 *
 * Note: The Spotify app must be in "Extended Quota Mode" or have the
 * connecting user added as a Development User in the Dashboard for API
 * calls to succeed.
 */

"use client"

const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!

// redirect_uri must exactly match one of the URIs registered in the
// Spotify Developer Dashboard. Set via NEXT_PUBLIC_SPOTIFY_REDIRECT_URI
// in .env.local (dev) or the hosting provider's env config (production).
const REDIRECT_URI = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI!

// Scopes define what the app is allowed to do on the user's Spotify account.
// "streaming" + "user-read-private" + "user-read-email" are required for the
// Web Playback SDK. The playlist and playback scopes enable the rest of the UI.
const SCOPES = [
  "streaming",                    // Web Playback SDK audio output
  "user-read-email",              // Display the connected account's email
  "user-read-private",            // Required alongside streaming
  "user-read-playback-state",     // Read shuffle state, current device, etc.
  "user-modify-playback-state",   // Pause, seek, skip, shuffle, queue tracks
  "playlist-read-private",        // List the user's private playlists
  "playlist-read-collaborative",  // List collaborative playlists
].join(" ")

/**
 * Generates a cryptographically random string of the given length.
 * Used as the PKCE code_verifier — must be stored until token exchange.
 */
function generateCodeVerifier(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => chars[b % chars.length]).join("")
}

/**
 * Hashes the code_verifier using SHA-256 and base64url-encodes the result.
 * This is the code_challenge sent to Spotify; without the original verifier
 * the auth code cannot be exchanged for tokens, preventing interception attacks.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

/**
 * Starts the Spotify OAuth flow by redirecting the browser to Spotify's
 * /authorize page. The PKCE code_verifier is base64-encoded into the OAuth
 * `state` parameter so it survives the cross-origin redirect chain
 * (localhost -> Spotify -> 127.0.0.1) without relying on browser storage,
 * which is not shared between localhost and 127.0.0.1.
 *
 * @param options.showDialog — Pass true to force Spotify to show the account
 *   chooser even if the user is already logged in. Used by the "Switch Account"
 *   button so staff can swap between Spotify accounts without signing out of
 *   Spotify in the browser first.
 */
export async function initiateSpotifyAuth(options?: { showDialog?: boolean }): Promise<void> {
  const verifier = generateCodeVerifier(128)
  const challenge = await generateCodeChallenge(verifier)

  // Pass the verifier via the OAuth state parameter so it survives the
  // redirect chain regardless of origin changes (localhost vs 127.0.0.1)
  // or browser storage quirks. The state is returned unchanged by Spotify
  // in the callback URL's ?state= query param.
  const state = btoa(verifier)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
    state,
    // show_dialog=true forces the Spotify account chooser screen, enabling
    // users to switch to a different Spotify account mid-session.
    ...(options?.showDialog ? { show_dialog: "true" } : {}),
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

/**
 * Completes the OAuth flow by exchanging the authorization code (from the
 * ?code= query param on the callback page) for access and refresh tokens.
 * The PKCE code_verifier is decoded from the OAuth `state` parameter, which
 * Spotify echoes back unchanged in the callback URL's ?state= query param.
 *
 * Called by /app/spotify-callback/page.tsx immediately after the redirect.
 * At this point we're running on 127.0.0.1 (Spotify's redirect target).
 */
export async function exchangeCodeForToken(code: string, state: string): Promise<SpotifyTokens> {
  // Recover the PKCE verifier from the OAuth state parameter
  const verifier = atob(state)
  if (!verifier) throw new Error("Missing PKCE code verifier in state")

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000, // absolute ms timestamp
  }
}

/**
 * Requests a new access_token using the stored refresh_token.
 * Called by use-spotify-player.ts inside the getOAuthToken callback,
 * which the Spotify SDK invokes automatically when it needs a fresh token.
 * PKCE token refresh does not use a client secret.
 */
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)")
    throw new Error(`Token refresh failed: HTTP ${res.status} — ${body}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // keep old token if not rotated
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

/**
 * Removes any Spotify-related data from browser storage.
 * Called by the Disconnect and Switch Account buttons before clearing
 * the Zustand store and/or redirecting to Spotify's login page.
 */
export function clearSpotifyTokens(): void {
  localStorage.removeItem("spotify_tokens")
  localStorage.removeItem("spotify_code_verifier")
}

/** Shape of the Spotify token bundle stored in the Zustand spotify-store. */
export interface SpotifyTokens {
  accessToken: string   // Bearer token for Spotify Web API calls
  refreshToken: string  // Used to obtain new access tokens without re-login
  expiresAt: number     // Absolute ms timestamp when the access token expires
}
