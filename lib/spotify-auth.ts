/**
 * spotify-auth.ts — Spotify OAuth PKCE flow (client-side)
 *
 * Implements the Spotify Authorization Code with PKCE flow.
 * PKCE (Proof Key for Code Exchange) is used instead of a client secret
 * because this code runs in the browser and secrets can't be kept safe there.
 *
 * Flow overview:
 *   1. initiateSpotifyAuth() — generates a random code_verifier, hashes it
 *      into a code_challenge, stores the verifier in sessionStorage, then
 *      redirects the browser to Spotify's /authorize endpoint.
 *   2. Spotify redirects back to /spotify-callback with a ?code= param.
 *   3. exchangeCodeForToken() — sends the code + the stored verifier to
 *      Spotify's /api/token endpoint to receive access + refresh tokens.
 *   4. Tokens are stored in the Zustand spotify-store (in memory only).
 *      They are NOT persisted to localStorage — each page load requires
 *      re-authentication via the Connect Spotify button.
 *   5. refreshAccessToken() is called by use-spotify-player.ts when the
 *      access token is within 60 seconds of expiry.
 *
 * Environment variable required:
 *   NEXT_PUBLIC_SPOTIFY_CLIENT_ID — from the Spotify Developer Dashboard
 *
 * Note: The Spotify app must be in "Extended Quota Mode" or have the
 * connecting user added as a Development User in the Dashboard for API
 * calls to succeed.
 */

"use client"

const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!

// redirect_uri must exactly match one of the URIs registered in the
// Spotify Developer Dashboard (both localhost and the production URL).
const REDIRECT_URI =
  typeof window !== "undefined"
    ? `${window.location.origin}/spotify-callback`
    : ""

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
 * /authorize page. The code_verifier is saved in sessionStorage so
 * exchangeCodeForToken() can retrieve it after the redirect back.
 *
 * @param options.showDialog — Pass true to force Spotify to show the account
 *   chooser even if the user is already logged in. Used by the "Switch Account"
 *   button so staff can swap between Spotify accounts without signing out of
 *   Spotify in the browser first.
 */
export async function initiateSpotifyAuth(options?: { showDialog?: boolean }): Promise<void> {
  const verifier = generateCodeVerifier(128)
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem("spotify_code_verifier", verifier)

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${window.location.origin}/spotify-callback`,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
    // show_dialog=true forces the Spotify account chooser screen, enabling
    // users to switch to a different Spotify account mid-session.
    ...(options?.showDialog ? { show_dialog: "true" } : {}),
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

/**
 * Completes the OAuth flow by exchanging the authorization code (from the
 * ?code= query param on the callback page) for access and refresh tokens.
 * The code_verifier is read from sessionStorage and then deleted.
 *
 * Called by /app/spotify-callback/page.tsx immediately after the redirect.
 */
export async function exchangeCodeForToken(code: string): Promise<SpotifyTokens> {
  const verifier = sessionStorage.getItem("spotify_code_verifier")
  if (!verifier) throw new Error("Missing PKCE code verifier")

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${window.location.origin}/spotify-callback`,
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
  sessionStorage.removeItem("spotify_code_verifier") // clean up immediately
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

  if (!res.ok) throw new Error("Token refresh failed")

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
  sessionStorage.removeItem("spotify_code_verifier")
}

/** Shape of the Spotify token bundle stored in the Zustand spotify-store. */
export interface SpotifyTokens {
  accessToken: string   // Bearer token for Spotify Web API calls
  refreshToken: string  // Used to obtain new access tokens without re-login
  expiresAt: number     // Absolute ms timestamp when the access token expires
}
