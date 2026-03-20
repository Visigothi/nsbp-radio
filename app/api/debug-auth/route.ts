import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  return NextResponse.json({
    hasSession: !!session,
    email: session?.user?.email ?? null,
    hasAccessToken: !!(session as unknown as Record<string, unknown>)?.accessToken,
    sessionKeys: session ? Object.keys(session as unknown as Record<string, unknown>) : [],
  })
}
