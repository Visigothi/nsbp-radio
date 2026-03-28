/**
 * proxy.ts — Route protection middleware
 *
 * Handles two separate authentication layers:
 *
 * 1. Admin routes (/admin, /admin/*):
 *    Checked against a signed `admin_session` JWT cookie minted by
 *    /api/admin/verify after Google OAuth. Expired or missing cookie
 *    redirects to /admin/login. The NextAuth session is NOT required
 *    for admin routes — only the admin_session cookie matters.
 *
 * 2. Regular app routes (everything else):
 *    Checked for the presence of the NextAuth session cookie
 *    (`authjs.session-token` on HTTP, `__Secure-authjs.session-token`
 *    on HTTPS). Unauthenticated users are sent to /login; authenticated
 *    users visiting /login are redirected to /.
 *
 * Excluded from middleware entirely (handled by their own auth logic):
 *   - api/auth/*          NextAuth OAuth endpoints
 *   - api/admin/verify    Post-OAuth admin verification (needs open access)
 *   - admin/login         Admin login page
 *   - spotify-callback    Spotify OAuth callback (runs on 127.0.0.1)
 *   - _next/*             Next.js static assets
 *   - favicon.ico
 */

import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Admin dashboard routes ────────────────────────────────────────────────
  // /admin/login and /api/admin/verify are excluded by the matcher below,
  // so any /admin path reaching here requires a valid admin session cookie.
  if (pathname.startsWith("/admin")) {
    const adminToken = req.cookies.get("admin_session")?.value

    if (!adminToken) {
      return NextResponse.redirect(new URL("/admin/login", req.url))
    }

    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
      await jwtVerify(adminToken, secret)
      return NextResponse.next()
    } catch {
      // Expired or tampered token — clear the cookie and send to login
      const res = NextResponse.redirect(new URL("/admin/login", req.url))
      res.cookies.delete("admin_session")
      return res
    }
  }

  // ── Regular app routes ────────────────────────────────────────────────────
  const isLoginPage = pathname === "/login"

  // NextAuth v5 uses "authjs.session-token" (HTTP) or
  // "__Secure-authjs.session-token" (HTTPS) for the session cookie
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token")

  if (!hasSession && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  return NextResponse.next()
}

/**
 * Middleware matcher — routes this middleware runs on.
 *
 * Excluded:
 *   api/auth/*         NextAuth OAuth endpoints must be public
 *   api/admin/verify   Admin OAuth callback; verifies session inside the handler
 *   admin/login        Admin login page; no cookie required to render
 *   spotify-callback   Loads on 127.0.0.1 where the session cookie is absent
 *   _next/static/*     Next.js JS/CSS bundles
 *   _next/image/*      Next.js image optimisation endpoint
 *   favicon.ico        Browser favicon
 */
export const config = {
  matcher: [
    "/((?!api/auth|api/admin/verify|admin/login|spotify-callback|_next/static|_next/image|favicon.ico).*)",
  ],
}
