export interface DriveFile {
  id: string
  name: string
  displayName: string
  mimeType: string
}

export async function fetchDriveFiles(
  folderId: string,
  apiKey: string
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and mimeType='audio/mpeg' and trashed=false`,
    fields: "files(id,name,mimeType)",
    key: apiKey,
    pageSize: "100",
    orderBy: "name",
  })

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive API error: ${err}`)
  }

  const data: { files: { id: string; name: string; mimeType: string }[] } = await res.json()

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

export function getDriveAudioUrl(fileId: string, apiKey: string): string {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
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
