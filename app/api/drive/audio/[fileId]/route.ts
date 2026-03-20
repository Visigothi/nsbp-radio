import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

/**
 * Proxy route for Google Drive audio files.
 *
 * The browser <audio> element cannot send Authorization headers, so we proxy
 * the request here on the server using the user's stored Google access token.
 * Range requests are forwarded so the browser can seek within the audio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth()

  if (!session?.accessToken) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const { fileId } = await params
  const rangeHeader = request.headers.get("range")

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      },
    }
  )

  if (driveRes.status === 401 || driveRes.status === 403) {
    return new NextResponse("Drive access denied", { status: 403 })
  }

  if (!driveRes.ok) {
    return new NextResponse("Failed to fetch from Drive", {
      status: driveRes.status,
    })
  }

  // Forward relevant headers so the browser can seek (Content-Range, Accept-Ranges)
  const headers = new Headers()
  for (const key of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const val = driveRes.headers.get(key)
    if (val) headers.set(key, val)
  }

  return new NextResponse(driveRes.body, {
    status: driveRes.status,
    headers,
  })
}
