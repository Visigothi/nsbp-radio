export interface DriveFile {
  id: string
  name: string
  displayName: string
  mimeType: string
}

export class DriveAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DriveAccessError"
  }
}

export async function fetchDriveFiles(
  folderId: string,
  accessToken: string
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and mimeType='audio/mpeg' and trashed=false`,
    fields: "files(id,name,mimeType)",
    pageSize: "100",
    orderBy: "name",
  })

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (res.status === 401 || res.status === 403) {
    throw new DriveAccessError(
      "Your Google account doesn't have access to the commercials folder. Contact your administrator."
    )
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive API error: ${err}`)
  }

  const data: { files: { id: string; name: string; mimeType: string }[] } =
    await res.json()

  return data.files.map((f) => ({
    id: f.id,
    name: f.name,
    displayName: f.name
      .replace(/\.mp3$/i, "")
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    mimeType: f.mimeType,
  }))
}

/**
 * Returns a URL that proxies the audio file through our Next.js server.
 * The browser <audio> element can't send Authorization headers, so the
 * server-side proxy route adds the Bearer token before hitting Drive.
 */
export function getDriveAudioProxyUrl(fileId: string): string {
  return `/api/drive/audio/${fileId}`
}

export function extractFolderIdFromUrl(url: string): string | null {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/,
  ]
  for (const pattern of patterns) {
    const match = url.trim().match(pattern)
    if (match) return match[1]
  }
  return null
}
