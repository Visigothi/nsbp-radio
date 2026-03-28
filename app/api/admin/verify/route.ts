/**
 * GET /api/admin/verify
 *
 * Called by NextAuth as the OAuth callbackUrl after a Google sign-in initiated
 * from the admin login page. Verifies that the authenticated email matches
 * ADMIN_EMAIL, then mints a signed 1-hour admin session JWT and sets it as an
 * httpOnly cookie before redirecting to /admin.
 *
 * This route is excluded from the NextAuth middleware matcher so it can be
 * reached after OAuth regardless of the user's ALLOWED_EMAILS status.
 */

import { auth } from "@/auth"
import { SignJWT } from "jose"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  if (!session?.user?.email) {
    return NextResponse.redirect(new URL("/admin/login?error=no_session", origin))
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()
  if (!adminEmail || session.user.email.toLowerCase() !== adminEmail) {
    return NextResponse.redirect(new URL("/admin/login?error=unauthorized", origin))
  }

  // Mint a signed 1-hour admin session JWT using the same secret as NextAuth
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
  const token = await new SignJWT({ email: session.user.email, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(secret)

  const response = NextResponse.redirect(new URL("/admin", origin))
  response.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3600,
    path: "/",
  })

  return response
}
