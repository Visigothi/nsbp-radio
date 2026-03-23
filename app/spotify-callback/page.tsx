/**
 * spotify-callback/page.tsx — Spotify OAuth redirect handler
 *
 * This page is the target of Spotify's OAuth redirect. It runs on
 * http://127.0.0.1:3000/spotify-callback because Spotify requires the
 * redirect URI to use 127.0.0.1 for non-HTTPS development environments
 * (localhost is rejected by Spotify's API in dev).
 *
 * The problem: the rest of the app (and the NextAuth Google session cookie)
 * lives on http://localhost:3000. Browsers treat localhost and 127.0.0.1
 * as separate origins, so cookies, localStorage, and sessionStorage are
 * NOT shared between them.
 *
 * The solution — token bridging via URL hash fragment:
 *   1. Spotify redirects here with ?code= and ?state= query params.
 *   2. This page calls exchangeCodeForToken(code, state) to trade the
 *      authorization code for access + refresh tokens. The PKCE verifier
 *      is decoded from the `state` param (not from browser storage).
 *   3. The tokens are base64-encoded into a URL hash fragment and the
 *      browser is redirected to localhost:3000/#spotify_tokens=<base64>.
 *   4. AppShell.tsx on localhost reads the hash, stores tokens in the
 *      Zustand store, and clears the hash from the URL.
 *
 * Why a hash fragment? Hash fragments (#...) are never sent to the server
 * in HTTP requests, so the tokens remain client-side only. This is safer
 * than putting them in query parameters, which would appear in server logs,
 * the Referer header, and browser history.
 *
 * This page is excluded from the auth middleware matcher in proxy.ts so
 * it can load without a valid NextAuth session (the session cookie won't
 * be present on the 127.0.0.1 origin).
 */

"use client"

import { Suspense, useState } from "react"
import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { exchangeCodeForToken } from "@/lib/spotify-auth"

/**
 * Redirects the browser from the 127.0.0.1 callback origin back to the
 * localhost origin where the main app and NextAuth session live.
 *
 * If tokens are provided (successful auth), they are base64-encoded into
 * the URL hash fragment so AppShell.tsx can pick them up on the other side.
 * If no tokens (error case), redirects to the app root without a hash.
 */
function redirectToApp(tokens?: { accessToken: string; refreshToken: string; expiresAt: number }) {
  // Build the localhost URL using the same protocol and port as the current
  // page, but swap the hostname from 127.0.0.1 to localhost.
  const base = `${window.location.protocol}//localhost:${window.location.port}/`
  if (tokens) {
    const encoded = btoa(JSON.stringify(tokens))
    window.location.href = `${base}#spotify_tokens=${encoded}`
  } else {
    window.location.href = base
  }
}

/**
 * CallbackHandler — processes the OAuth callback query params.
 *
 * Wrapped in <Suspense> because useSearchParams() requires it in Next.js
 * App Router (it suspends during static rendering).
 *
 * Flow:
 *   1. Read ?code= and ?state= from the URL (set by Spotify's redirect).
 *   2. If ?error= is present, Spotify denied the request — show the error
 *      briefly and redirect home.
 *   3. Pass code + state to exchangeCodeForToken(), which decodes the PKCE
 *      verifier from `state` and exchanges the code for tokens.
 *   4. On success, redirect to localhost with tokens in the hash fragment.
 *   5. On failure, show the error for 3 seconds then redirect home.
 */
function CallbackHandler() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState("Connecting Spotify...")

  useEffect(() => {
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    // Spotify sets ?error= when the user denies the auth request or
    // something goes wrong on their end.
    if (error) {
      console.error("Spotify auth error:", error)
      setStatus(`Spotify error: ${error}. Redirecting...`)
      setTimeout(() => redirectToApp(), 2000)
      return
    }

    // `state` carries the base64-encoded PKCE verifier. Both `code` and
    // `state` are required to complete the token exchange.
    const state = searchParams.get("state")

    if (!code || !state) {
      console.error("Missing code or state in callback URL")
      setStatus("Missing authorization data. Redirecting...")
      setTimeout(() => redirectToApp(), 2000)
      return
    }

    setStatus("Exchanging code for tokens...")

    exchangeCodeForToken(code, state)
      .then((tokens) => {
        setStatus("Connected! Redirecting...")
        redirectToApp(tokens)
      })
      .catch((err) => {
        console.error("Token exchange failed:", err)
        setStatus(`Token exchange failed: ${err.message}. Redirecting...`)
        setTimeout(() => redirectToApp(), 3000)
      })
  }, [searchParams])

  return <p className="text-zinc-400 text-sm">{status}</p>
}

export default function SpotifyCallbackPage() {
  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Suspense fallback={<p className="text-zinc-400 text-sm">Loading...</p>}>
        <CallbackHandler />
      </Suspense>
    </main>
  )
}
