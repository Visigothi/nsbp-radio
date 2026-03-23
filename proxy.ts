/**
 * proxy.ts — NextAuth v5 middleware for route protection
 *
 * Wraps the NextAuth `auth()` helper as Edge Middleware to enforce
 * authentication on every route except those excluded by the matcher below.
 *
 * Behavior:
 *   - Unauthenticated users are redirected to /login.
 *   - Already-authenticated users who visit /login are redirected to /.
 *   - All other requests pass through unchanged.
 */

import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isLoginPage = req.nextUrl.pathname === "/login"

  // Not logged in and trying to access a protected page → send to login
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Already logged in but visiting /login → send to app root
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
})

/**
 * Middleware matcher — defines which routes this middleware runs on.
 *
 * The negative lookahead excludes:
 *   - api/auth/*       — NextAuth API routes (must be publicly accessible
 *                        for the OAuth flow to complete)
 *   - spotify-callback — The Spotify OAuth redirect target. This route is
 *                        loaded on the 127.0.0.1 origin where the NextAuth
 *                        session cookie (bound to localhost) is not present.
 *                        Without this exclusion, the middleware would redirect
 *                        the callback page to /login, breaking the Spotify
 *                        OAuth flow entirely.
 *   - _next/static/*   — Next.js static assets (JS bundles, CSS)
 *   - _next/image/*    — Next.js optimised image endpoint
 *   - favicon.ico      — Browser favicon request
 */
export const config = {
  matcher: ["/((?!api/auth|spotify-callback|_next/static|_next/image|favicon.ico).*)"],
}
