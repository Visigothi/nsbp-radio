/**
 * drive-api.ts — Google Drive API types and helpers (client-side)
 *
 * These utilities support the announcements panel, which loads MP3 files
 * from a shared Google Drive folder.
 *
 * IMPORTANT — Architecture note:
 *   The browser cannot call the Google Drive API directly with the user's
 *   access token because Next.js client-side sessions strip the token for
 *   security. All actual Drive API requests go through server-side proxy
 *   routes in /app/api/drive/ which read the token via auth() directly.
 *
 *   fetchDriveFiles() below is a legacy helper kept for reference but is
 *   NOT used in production — the CommercialPanel calls /api/drive/files
 *   (the server proxy) instead.
 *
 *   getDriveAudioProxyUrl() IS used in production — the <audio> element
 *   src is always set to the proxy URL, never directly to Drive.
 */

/** A Google Drive MP3 file as used throughout the app */
export interface DriveFile {
  id: string           // Google Drive file ID — used to construct proxy URLs
  name: string         // Original filename including .mp3 extension
  displayName: string  // Cleaned-up name: .mp3 removed, underscores/dashes → spaces
  mimeType: string     // Should be "audio/mpeg" for all files in this folder
}

/**
 * Custom error class thrown when the Google account lacks Drive access.
 * CommercialPanel catches this to show the "Talk to Mike" error message
 * rather than a generic network error.
 */
export class DriveAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DriveAccessError"
  }
}

/**
 * Direct Drive API call — NOT used in the current production flow.
 * Kept for reference. In production, CommercialPanel calls /api/drive/files
 * (a Next.js server route) which makes this same request server-side using
 * the session token from auth().
 *
 * Left here in case a future developer needs to understand the Drive query
 * structure: only audio/mpeg files, not in the trash, ordered by name.
 */
export async function fetchDriveFiles(
  folderId: string,
  accessToken: string
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    // Drive query: only MP3s in the target folder that aren't deleted
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
    // Strip .mp3 extension and normalise separators for display
    displayName: f.name
      .replace(/\.mp3$/i, "")
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    mimeType: f.mimeType,
  }))
}

/**
 * Returns the URL for the server-side audio proxy for a given Drive file.
 *
 * Why a proxy?
 *   The browser's <audio> element cannot add Authorization headers to its
 *   HTTP request. The Google Drive download URL requires a Bearer token.
 *   Our Next.js route at /api/drive/audio/[fileId] receives the request,
 *   fetches the session token server-side, adds the Authorization header,
 *   and streams the audio back to the browser — including proper handling
 *   of Range headers so the <audio> element can seek within the file.
 *
 * @param fileId — Google Drive file ID (the `id` field on a DriveFile)
 */
export function getDriveAudioProxyUrl(fileId: string): string {
  return `/api/drive/audio/${fileId}`
}

/**
 * Extracts a Google Drive folder ID from various URL formats or a raw ID.
 * Handles:
 *   - Full Drive folder URLs: https://drive.google.com/drive/folders/FOLDER_ID
 *   - Sharing URLs with ?id= parameter
 *   - Raw IDs (alphanumeric strings of 20+ characters)
 *
 * Returns null if no folder ID pattern is recognised.
 * (Currently unused since the folder is hardcoded, but kept for future use.)
 */
export function extractFolderIdFromUrl(url: string): string | null {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,   // Standard Drive folder URL
    /id=([a-zA-Z0-9_-]+)/,           // ?id= query param format
    /^([a-zA-Z0-9_-]{20,})$/,        // Raw ID string (min 20 chars)
  ]
  for (const pattern of patterns) {
    const match = url.trim().match(pattern)
    if (match) return match[1]
  }
  return null
}
