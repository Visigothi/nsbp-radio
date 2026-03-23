/**
 * spotify-api.ts — Spotify Web API helper functions
 *
 * Thin wrappers around the Spotify REST API. All functions accept an
 * accessToken (from the Zustand spotify-store) and make authenticated
 * requests to api.spotify.com.
 *
 * These are pure fetch functions with no React hooks — they can be called
 * from anywhere, including event handlers and async callbacks.
 *
 * For Spotify Web Playback SDK operations (play/pause/skip/volume) that
 * work through the in-browser player, use the `player` instance from
 * useSpotifyStore directly instead.
 */

/** Minimal playlist shape returned by the /v1/me/playlists endpoint */
export interface SpotifyPlaylist {
  id: string                      // Spotify playlist ID
  name: string                    // Display name
  images: { url: string }[]       // Playlist cover art (various sizes)
  tracks: { total: number }       // Total track count
}

/**
 * Fetches all playlists owned or followed by the authenticated user.
 * Paginates automatically — Spotify returns max 50 per page.
 * Returns every playlist regardless of how many there are.
 */
export async function fetchUserPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const playlists: SpotifyPlaylist[] = []
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50"

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Spotify playlists fetch failed: ${res.status}`)
    const data: { items: SpotifyPlaylist[]; next: string | null } = await res.json()
    playlists.push(...data.items)
    url = data.next // null when there are no more pages
  }

  return playlists
}

/**
 * Starts playback of a Spotify playlist context on the specified device.
 * Playing a "context_uri" (playlist) rather than a list of track URIs means
 * Spotify handles the queue automatically — shuffle, next/previous all work
 * relative to the playlist rather than just a one-shot track list.
 *
 * @param contextUri — e.g. "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
 */
export async function playPlaylist(
  accessToken: string,
  deviceId: string,
  contextUri: string
): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ context_uri: contextUri }),
    }
  )
  // 204 No Content is the success response from this endpoint
  if (!res.ok && res.status !== 204) throw new Error(`Play failed: ${res.status}`)
}

/**
 * Transfers active playback to the NSBP Radio browser tab device.
 * Called once the Spotify SDK reports "ready" with a device_id.
 *
 * Without this call, Spotify keeps playing on whatever device was
 * active last (phone, desktop app, etc.) rather than through the browser.
 * play: false means transfer happens without auto-starting music.
 */
export async function transferPlayback(
  accessToken: string,
  deviceId: string
): Promise<void> {
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  })
  if (!res.ok && res.status !== 204) throw new Error(`Transfer failed: ${res.status}`)
}

/**
 * Skips to the next track in the queue on the specified device.
 * Used by the explicit filter to silently skip flagged tracks,
 * and by the announcement engine to advance after an announcement ends.
 */
export async function skipToNext(accessToken: string, deviceId: string): Promise<void> {
  await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/**
 * Seeks to an absolute position within the currently playing track.
 * Used by the announcement engine to restore the exact playback position
 * after an "interrupt" mode announcement finishes and the original
 * track resumes.
 *
 * @param positionMs — Target position in milliseconds from the start of the track
 */
export async function seekToPosition(
  accessToken: string,
  deviceId: string,
  positionMs: number
): Promise<void> {
  await fetch(
    `https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
}

/**
 * Search result track shape from the Spotify /v1/search endpoint.
 *
 * Deliberately mirrors the same fields as QueueTrack in spotify-store.ts
 * (id, uri, name, artists, explicit, albumArt, duration) so that the
 * TrackRow component in SpotifyPanel can render search results and queue
 * items interchangeably without conditional field mapping.
 *
 * The `artists` field is pre-joined into a comma-separated string rather
 * than kept as an array — this matches what QueueTrack already stores and
 * avoids repeated .map().join() calls at render time.
 */
export interface SearchTrack {
  id: string                      // Spotify track ID
  uri: string                     // Full Spotify URI (e.g. "spotify:track:...")
  name: string                    // Track title
  artists: string                 // Comma-separated artist names (pre-joined)
  explicit: boolean               // Explicit content flag (used by the skip filter)
  albumArt: string                // URL of the first album image (largest available)
  duration: number                // Track length in milliseconds
}

/**
 * Searches the Spotify catalog for tracks matching the given query.
 *
 * Only searches type=track — podcasts, audiobooks, and episodes are excluded
 * because NSBP Radio is a music-only player. The Spotify Search API returns
 * results ranked by relevance, which works well for the "play a specific song"
 * use case at the bike park.
 *
 * The raw Spotify response shape is deeply nested (artists as objects, album
 * images as arrays, duration as `duration_ms`). This function flattens it into
 * our SearchTrack interface so the UI layer never deals with raw API shapes.
 *
 * @param accessToken — OAuth access token from the Zustand store
 * @param query       — Free-text search string (artist, track name, etc.)
 * @param limit       — Max results to return (1–50, default 20)
 * @returns Flattened SearchTrack array ready for TrackRow rendering
 */
export async function searchTracks(
  accessToken: string,
  query: string,
  limit: number = 20
): Promise<SearchTrack[]> {
  // encodeURIComponent handles special characters in user input (quotes, ampersands, etc.)
  const q = encodeURIComponent(query)

  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Spotify search failed: ${res.status}`)

  const data = await res.json()
  // Defensive fallback — data.tracks may be missing on malformed responses
  const items = data.tracks?.items ?? []

  // Map Spotify's verbose response into our flat SearchTrack shape.
  // Each field is chosen to match QueueTrack so TrackRow renders both identically.
  return items.map((track: {
    id: string
    uri: string
    name: string
    artists: { name: string }[]
    explicit: boolean
    album: { images: { url: string }[] }
    duration_ms: number
  }) => ({
    id: track.id,
    uri: track.uri,
    name: track.name,
    // Pre-join artist names — avoids repeated joins in render cycles
    artists: track.artists.map((a: { name: string }) => a.name).join(", "),
    explicit: track.explicit,
    // Spotify returns images sorted largest-first; [0] gives the best quality.
    // Falls back to empty string if no art exists (TrackRow renders a grey box).
    albumArt: track.album.images?.[0]?.url ?? "",
    // Rename from Spotify's `duration_ms` to our standard `duration` field name
    duration: track.duration_ms,
  }))
}
