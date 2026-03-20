export interface SpotifyPlaylist {
  id: string
  name: string
  images: { url: string }[]
  tracks: { total: number }
}

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
    url = data.next
  }

  return playlists
}

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
  if (!res.ok && res.status !== 204) throw new Error(`Play failed: ${res.status}`)
}

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

export async function skipToNext(accessToken: string, deviceId: string): Promise<void> {
  await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

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
