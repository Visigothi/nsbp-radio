import { auth } from "@/auth"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const accessToken = (session as unknown as Record<string, unknown>).accessToken as
    | string
    | undefined

  if (!accessToken) {
    return NextResponse.json(
      { error: "NO_ACCESS_TOKEN", message: "Session has no Google access token. Please sign out and sign back in." },
      { status: 401 }
    )
  }

  const folderId = request.nextUrl.searchParams.get("folderId")
  if (!folderId) {
    return NextResponse.json({ error: "Missing folderId" }, { status: 400 })
  }

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and mimeType='audio/mpeg' and trashed=false`,
    fields: "files(id,name,mimeType)",
    pageSize: "100",
    orderBy: "name",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  })

  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (driveRes.status === 401 || driveRes.status === 403) {
    return NextResponse.json(
      { error: "DRIVE_ACCESS_DENIED", message: "Your Google account doesn't have access to the commercials folder." },
      { status: 403 }
    )
  }

  if (!driveRes.ok) {
    const body = await driveRes.text()
    return NextResponse.json(
      { error: "DRIVE_ERROR", message: body },
      { status: driveRes.status }
    )
  }

  const data = await driveRes.json()
  return NextResponse.json(data)
}
