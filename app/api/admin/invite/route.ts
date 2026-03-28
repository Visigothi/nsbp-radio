/**
 * POST /api/admin/invite
 *
 * Adds a Google email address to the admin_users table, granting that account
 * access to the admin panel. The invited email must not already exist in the
 * table. Protected by the admin_session JWT — only an existing admin can invite.
 *
 * On the invitee's side: they just visit /admin/login and sign in with the
 * invited Google account. No token or link needed.
 */

import { supabase } from "@/lib/supabase"
import { jwtVerify } from "jose"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  // Verify the caller is an authenticated admin
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("admin_session")?.value
  if (!adminToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let callerEmail: string
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
    const { payload } = await jwtVerify(adminToken, secret)
    callerEmail = payload.email as string
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Parse and validate request body
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = (body.email ?? "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 })
  }

  // Insert — unique constraint on email prevents duplicates
  const { error } = await supabase.from("admin_users").insert({
    email,
    invited_by: callerEmail,
  })

  if (error) {
    // Postgres unique violation code
    if (error.code === "23505") {
      return NextResponse.json({ error: "This email already has admin access" }, { status: 409 })
    }
    console.error("[admin/invite] Supabase insert error:", error)
    return NextResponse.json({ error: "Failed to add admin user" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email })
}
