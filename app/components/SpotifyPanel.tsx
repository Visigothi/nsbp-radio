/**
 * SpotifyPanel.tsx — The left-hand panel: player, playlists, search, and queue.
 *
 * This is the main music control surface for NSBP Radio. It renders:
 *   1. Now Playing card — album art, track info, progress bar, transport controls
 *   2. Tab bar — switches between Playlists and Search views
 *   3. Playlists tab — playlist selector dropdown + Up Next queue
 *   4. Search tab — Spotify catalog search with Queue / Play Now actions
 *
 * Architecture notes:
 * - The component initialises three hooks on mount: useSpotifyPlayer (creates
 *   the Spotify Web Playback SDK instance), useQueue (polls Spotify's queue
 *   endpoint), and usePlayHistory (tracks play counts for repeat detection).
 * - State is split between two Zustand stores: useSpotifyStore (tokens, player,
 *   queue, playback state) and useCommercialStore (announcement scheduling).
 * - Search results and queue tracks share the same TrackRow component because
 *   SearchTrack and QueueTrack have identical shapes by design.
 * - The queuedSearchTrack state tracks a single search result that has been
 *   added to Spotify's queue, so it can be displayed in the Up Next box alongside
 *   announcements and Closing Time. It is cleared when the track starts playing
 *   or when an announcement takes priority.
 */
"use client"

import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { useSpotifyStore } from "@/lib/spotify-store"
import { useCommercialStore } from "@/lib/commercial-store"
import { useSpotifyPlayer } from "@/lib/use-spotify-player"
import { useQueue } from "@/lib/use-queue"
import { usePlayHistory } from "@/lib/use-play-history"
import { getPlayCounts, PlayCounts } from "@/lib/play-history"
import { initiateSpotifyAuth, clearSpotifyTokens } from "@/lib/spotify-auth"
import { getSkippedUris, skipTrack, unskipTrack } from "@/lib/skipped-tracks"
import {
  fetchUserPlaylists,
  playPlaylist,
  transferPlayback,
  searchTracks,
  SpotifyPlaylist,
  SearchTrack,
} from "@/lib/spotify-api"

export default function SpotifyPanel() {
  useSpotifyPlayer()
  const { refreshQueue } = useQueue()
  usePlayHistory()

  const { tokens, spotifyUser, player, deviceId, playerState, isReady, queue, clearTokens, setSpotifyUser } = useSpotifyStore()
  const {
    status: announcementStatus,
    queued: queuedAnnouncement,
    closingTimeQueued,
    queueCommercial,
    setPendingTrack,
    clearQueue,
    setClosingTimeQueued,
    setClosingTimeRemoved,
    autoSkipEnabled,
    autoSkipThreshold,
  } = useCommercialStore()
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null)
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [progress, setProgress] = useState(0)
  const [micActive, setMicActive] = useState(false)
  // Set of Spotify track URIs that staff have manually skipped for today.
  // Initialised from localStorage (with automatic 6AM daily reset via getSkippedUris).
  const [skippedUris, setSkippedUris] = useState<Set<string>>(() => getSkippedUris())
  // ── Search & tab state ──
  // activeTab controls which content renders below the Now Playing card
  const [activeTab, setActiveTab] = useState<"playlists" | "search">("playlists")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([])
  const [searching, setSearching] = useState(false)
  // Tracks the single search result currently sitting in Spotify's queue.
  // Only one item can be queued at a time (matching announcement behaviour).
  // Displayed in the Up Next box on the Playlists tab and shown with an
  // orange tint in search results. Cleared when the track starts playing
  // or an announcement takes priority.
  const [queuedSearchTrack, setQueuedSearchTrack] = useState<SearchTrack | null>(null)
  const micFading = useRef(false)
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleMicToggle = async () => {
    if (!player || micFading.current) return
    micFading.current = true
    const STEPS = 30
    const DELAY = 1500 / STEPS
    if (!micActive) {
      // Fade down to 10%
      for (let i = STEPS; i >= STEPS * 0.1; i--) {
        player.setVolume(i / STEPS)
        await new Promise((r) => setTimeout(r, DELAY))
      }
      player.setVolume(0.1)
      setMicActive(true)
    } else {
      // Fade back up to 100%
      for (let i = Math.round(STEPS * 0.1); i <= STEPS; i++) {
        player.setVolume(i / STEPS)
        await new Promise((r) => setTimeout(r, DELAY))
      }
      player.setVolume(1)
      setMicActive(false)
    }
    micFading.current = false
  }

  /**
   * Toggles a track's skipped state. Skipped tracks are dimmed in the Up Next
   * list and auto-skipped by useSkippedFilter when they come up in playback.
   * The skip list resets at 6AM daily via skipped-tracks.ts.
   */
  const handleSkipToggle = (uri: string) => {
    setSkippedUris((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) {
        unskipTrack(uri)
        next.delete(uri)
      } else {
        skipTrack(uri)
        next.add(uri)
      }
      return next
    })
  }

  // Continuously enforce 10% volume while mic is active.
  // Spotify resets the SDK volume internally during each track transition (after
  // player_state_changed fires), so a one-shot effect always loses the race.
  // Polling every 250 ms ensures any spike is corrected within a quarter-second.
  const micActiveRef = useRef(micActive)
  useEffect(() => { micActiveRef.current = micActive }, [micActive])
  useEffect(() => {
    if (!micActive || !player) return
    const id = setInterval(() => player.setVolume(0.1), 250)
    return () => clearInterval(id)
  }, [micActive, player])

  // Transfer playback to this device once ready.
  // The SDK may report "ready" slightly before the device is registered on
  // Spotify's servers, causing a 404. Retry once after a short delay.
  useEffect(() => {
    if (!isReady || !deviceId || !tokens) return
    transferPlayback(tokens.accessToken, deviceId).catch(() => {
      setTimeout(() => {
        transferPlayback(tokens.accessToken, deviceId).catch(() => {})
      }, 2000)
    })
  }, [isReady, deviceId, tokens])

  // Fetch playlists + account info once connected
  useEffect(() => {
    if (!tokens) return
    setLoadingPlaylists(true)
    fetchUserPlaylists(tokens.accessToken)
      .then(setPlaylists)
      .catch(console.error)
      .finally(() => setLoadingPlaylists(false))
    // Fetch Spotify account identity
    fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((r) => r.json())
      .then((u) => setSpotifyUser({ displayName: u.display_name ?? u.id, email: u.email ?? "" }))
      .catch(console.error)
  }, [tokens]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effects to clear the queued search track ──
  //
  // The queuedSearchTrack indicator needs to be removed in two situations:
  //
  // 1. An announcement takes priority — only one item can occupy the "queued"
  //    slot at a time. When an announcement is queued, it supersedes the search
  //    track in the Up Next box, so we clear the search track to avoid showing
  //    two queued items simultaneously.
  useEffect(() => {
    if (announcementStatus === "queued" && queuedAnnouncement) setQueuedSearchTrack(null)
  }, [announcementStatus, queuedAnnouncement])

  // 2. The queued track starts playing — we compare the currently playing
  //    track URI against the queued search track's URI. When they match, the
  //    track has left the queue and entered playback, so the indicator is stale.
  useEffect(() => {
    if (queuedSearchTrack && playerState?.trackUri === queuedSearchTrack.uri) {
      setQueuedSearchTrack(null)
    }
  }, [playerState?.trackUri, queuedSearchTrack])

  // Live progress bar
  useEffect(() => {
    if (!playerState) return
    setProgress(playerState.position)

    if (progressInterval.current) clearInterval(progressInterval.current)
    if (!playerState.paused) {
      progressInterval.current = setInterval(() => {
        setProgress((p) => Math.min(p + 500, playerState.duration))
      }, 500)
    }
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current)
    }
  }, [playerState])

  const handlePlayPlaylist = async (playlist: SpotifyPlaylist) => {
    if (!tokens || !deviceId) return
    setSelectedPlaylist(playlist)
    await playPlaylist(tokens.accessToken, deviceId, `spotify:playlist:${playlist.id}`)
    // Spotify's queue endpoint lags behind playback context changes.
    // Refresh at 500 ms, 1.5 s and 3 s to catch it at each update stage.
    setTimeout(refreshQueue, 500)
    setTimeout(refreshQueue, 1500)
    setTimeout(refreshQueue, 3000)
  }

  const handlePlayFromQueue = async (trackUri: string) => {
    if (!player || !tokens || !deviceId) return

    const contextUri = selectedPlaylist
      ? `spotify:playlist:${selectedPlaylist.id}`
      : null

    // If an announcement is queued, play it first, then the selected track
    if (announcementStatus === "queued" && queuedAnnouncement) {
      // Store the target track — the engine will play it after the announcement
      setPendingTrack({ trackUri, contextUri })
      // Switch announcement to interrupt mode so it plays immediately
      // (it may have been in "queue" mode waiting for song end)
      queueCommercial(queuedAnnouncement.file, "interrupt")
      return
    }

    // No announcement queued — fade out and play the selected track directly.
    // Respect mic mode: start fade from current volume, restore to correct target.
    const targetVol = micActiveRef.current ? 0.1 : 1
    const STEPS = 30
    const DELAY = 1500 / STEPS
    // Fade from current volume down to 0
    const startVol = micActiveRef.current ? 0.1 : 1
    for (let i = STEPS; i >= 0; i--) {
      player.setVolume((i / STEPS) * startVol)
      await new Promise((r) => setTimeout(r, DELAY))
    }

    const headers = {
      Authorization: `Bearer ${tokens.accessToken}`,
      "Content-Type": "application/json",
    }
    const playUrl = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`

    // Try playing within the playlist context so the playlist continues after this track.
    // If Spotify rejects it (e.g. the track isn't in the playlist), fall back to standalone.
    let res: Response | null = null
    if (contextUri) {
      res = await fetch(playUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify({ context_uri: contextUri, offset: { uri: trackUri }, position_ms: 0 }),
      })
    }
    if (!contextUri || (res && !res.ok)) {
      await fetch(playUrl, {
        method: "PUT",
        headers,
        body: JSON.stringify({ uris: [trackUri] }),
      })
    }

    // Fade back up to the correct volume (10% if mic is active, 100% otherwise)
    for (let i = 0; i <= STEPS; i++) {
      player.setVolume((i / STEPS) * targetVol)
      await new Promise((r) => setTimeout(r, DELAY))
    }

    // Spotify's queue endpoint lags behind the new playback position.
    // Refresh at 500 ms, 1.5 s and 3 s to ensure Up Next reflects the correct tracks.
    setTimeout(refreshQueue, 500)
    setTimeout(refreshQueue, 1500)
    setTimeout(refreshQueue, 3000)
  }

  /**
   * Search Spotify for tracks matching the query.
   * Called on form submit (Enter key or Search button click).
   * Results replace any previous search results — there is no pagination,
   * since the default 20 results from Spotify's relevance ranking are
   * more than enough for a "find and play one song" workflow.
   */
  const handleSearch = async () => {
    if (!tokens || !searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await searchTracks(tokens.accessToken, searchQuery.trim())
      setSearchResults(results)
    } catch (err) {
      console.error("Search failed:", err)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  /**
   * Queue a search result — adds it to Spotify's queue to play after the
   * current track finishes. Follows the same "only one queued item" rule as
   * announcements and Closing Time: clearQueue() removes any pending
   * announcement, and setClosingTimeQueued(false) removes a pending Closing
   * Time, so the search track becomes the sole occupant of the queue slot.
   *
   * Cold start handling: Spotify's POST /queue endpoint returns 404 when no
   * active playback session exists. If playerState is null (nothing playing),
   * we fall back to PUT /play with a `uris` array to start the track directly.
   * In this case we don't set queuedSearchTrack because the track plays
   * immediately — there's nothing to show in the "Up Next" box.
   */
  const handleQueueSearchResult = async (track: SearchTrack) => {
    if (!tokens || !deviceId) return
    // Clear any queued announcement or Closing Time — only one queued item allowed
    clearQueue()
    setClosingTimeQueued(false)

    if (!playerState) {
      // Cold start — no active playback, so we can't use the queue endpoint.
      // Play the track directly via PUT /play instead.
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [track.uri] }),
      })
    } else {
      // Active playback — use Spotify's queue endpoint so the track plays
      // after the current song finishes, preserving the playlist context.
      await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(track.uri)}&device_id=${deviceId}`,
        { method: "POST", headers: { Authorization: `Bearer ${tokens.accessToken}` } }
      )
      // Track the queued item so it appears in the Up Next box with an
      // orange tint, and so the Search tab shows it as "queued" (disabled buttons).
      setQueuedSearchTrack(track)
    }

    // Staggered queue refresh — Spotify's queue endpoint lags behind changes.
    // Three retries at increasing intervals catch it at each update stage.
    setTimeout(refreshQueue, 500)
    setTimeout(refreshQueue, 1500)
    setTimeout(refreshQueue, 3000)
  }

  /**
   * Play Now a search result — interrupts the current track immediately.
   *
   * Two distinct paths depending on whether music is already playing:
   *
   * Cold start (playerState is null):
   *   No music is active, so we play the track directly via PUT /play.
   *   No fade is needed because there's silence.
   *
   * Active playback:
   *   Uses the "fade → queue → skip → fade" pattern (same as handlePlayFromQueue).
   *   Why queue+skip instead of just PUT /play with a uris array? Because
   *   PUT /play with uris[] replaces the entire playback context — the playlist
   *   would be lost and wouldn't resume after the requested track. By queueing
   *   the track and immediately skipping to it, the original playlist context
   *   stays intact and resumes naturally once the search track finishes.
   *
   *   The 1.5-second fade (30 steps × 50ms) provides a smooth DJ-style
   *   crossfade. Volume targets respect mic mode (10% if active, 100% otherwise).
   */
  const handlePlayNowSearchResult = async (trackUri: string) => {
    if (!player || !tokens || !deviceId) return

    const headers = { Authorization: `Bearer ${tokens.accessToken}` }
    const isPlaying = !!playerState && !playerState.paused

    if (!playerState) {
      // Cold start — no active playback, play directly without fade
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [trackUri] }),
      })
    } else {
      // Active playback — fade out, queue+skip to preserve playlist context, fade in
      const STEPS = 30
      const DELAY = 1500 / STEPS  // ~50ms per step = 1.5s total fade
      const startVol = micActiveRef.current ? 0.1 : 1
      const targetVol = micActiveRef.current ? 0.1 : 1

      // Fade out from current volume to silence
      for (let i = STEPS; i >= 0; i--) {
        player.setVolume((i / STEPS) * startVol)
        await new Promise((r) => setTimeout(r, DELAY))
      }

      // Queue the track, then immediately skip to it.
      // This two-step dance preserves the playlist context (see docblock above).
      await fetch(
        `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}&device_id=${deviceId}`,
        { method: "POST", headers }
      )
      await fetch(
        `https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`,
        { method: "POST", headers }
      )

      // Fade back in to the correct target volume
      for (let i = 0; i <= STEPS; i++) {
        player.setVolume((i / STEPS) * targetVol)
        await new Promise((r) => setTimeout(r, DELAY))
      }
    }

    // Staggered queue refresh — same pattern as other playback actions
    setTimeout(refreshQueue, 500)
    setTimeout(refreshQueue, 1500)
    setTimeout(refreshQueue, 3000)
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }

  if (!tokens) {
    return (
      <div className="panel-card flex flex-col items-center justify-center gap-4 py-16">
        <div className="text-center space-y-2">
          <p className="text-zinc-300 font-medium">Connect Spotify</p>
          <p className="text-zinc-500 text-sm">
            Sign in with the NSBP Spotify Premium account to start playing music.
          </p>
        </div>
        <button
          onClick={() => initiateSpotifyAuth()}
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black font-semibold py-2.5 px-6 rounded-full transition-colors"
        >
          <SpotifyIcon />
          Connect Spotify
        </button>
      </div>
    )
  }

  const progressPct = playerState ? (progress / playerState.duration) * 100 : 0

  return (
    <div className="flex flex-col" style={{ gap: "var(--panel-gap)" }}>

      {/* ── Section 1: Now Playing ─────────────────────────────────────────── */}
      <div className="panel-card flex flex-col gap-4">
      <h2 className="theme-header text-sm font-semibold uppercase tracking-wider">
        Now Playing
      </h2>

      {/* Rounded box: player only — border/bg switch with theme */}
      <div
        className="rounded-xl p-4 flex flex-col gap-4"
        style={{ border: "var(--now-playing-border-width, 1px) solid var(--now-playing-border)", background: "var(--now-playing-bg)" }}
      >
      {/* Now playing card — compact horizontal layout, ~5% narrower than track list */}
      {playerState ? (
        <div className="mx-[2.5%]">
        <div className="flex gap-4 items-center">
          {/* Album art — 10% larger than before (128 → 141 px) */}
          {playerState.albumArt && (
            <div className="relative w-[141px] h-[141px] rounded-lg overflow-hidden shadow-2xl shrink-0">
              <Image
                src={playerState.albumArt}
                alt={playerState.albumName}
                fill
                className="object-cover"
              />
            </div>
          )}

          {/* Right column: info + progress + controls */}
          <div className="flex flex-col flex-1 min-w-0 gap-2">
            {/* Track info — centred */}
            <div className="text-center">
              <p
                className="font-bold text-lg uppercase leading-tight truncate"
                style={{ color: "var(--brand-orange)" }}
              >
                {playerState.trackName}
              </p>
              <p className="text-zinc-300 text-sm mt-0.5 truncate">{playerState.artistName}</p>
              <PlayCountLine uri={playerState.trackUri} />
            </div>

            {/* Progress bar — mt-1 gives breathing room below the play count */}
            <div className="space-y-1 mt-1">
              <div className="w-full bg-zinc-700 rounded-full h-1">
                <div
                  className="bg-white rounded-full h-1 transition-none"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{formatTime(progress)}</span>
                <span>{playerState.duration ? formatTime(playerState.duration) : "--:--"}</span>
              </div>
            </div>

            {/* Transport controls — centred */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => player?.previousTrack()}
                className="text-zinc-400 hover:text-white transition-colors"
                title="Previous"
              >
                <PrevIcon />
              </button>
              <button
                onClick={() => player?.togglePlay()}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                title={playerState.paused ? "Play" : "Pause"}
              >
                {playerState.paused ? <PlayIcon /> : <PauseIcon />}
              </button>
              {/* Mic button — fades music to 10% for live PA announcements */}
              <button
                onClick={handleMicToggle}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  micActive ? "mic-active bg-red-600 text-white" : "bg-zinc-600 hover:bg-zinc-500 text-zinc-200"
                }`}
                title={micActive ? "Mic on — click to restore volume" : "Mic announce — drops music to 10%"}
              >
                <MicIcon />
              </button>
              <button
                onClick={() => player?.nextTrack()}
                className="text-zinc-400 hover:text-white transition-colors"
                title="Next"
              >
                <NextIcon />
              </button>
              <button
                onClick={() => {
                  if (!tokens || !deviceId) return
                  fetch(
                    `https://api.spotify.com/v1/me/player/shuffle?state=${!playerState.shuffle}&device_id=${deviceId}`,
                    { method: "PUT", headers: { Authorization: `Bearer ${tokens.accessToken}` } }
                  ).catch(console.error)
                }}
                className="transition-colors"
                style={{ color: playerState.shuffle ? "var(--brand-orange)" : "rgb(161,161,170)" }}
                title={playerState.shuffle ? "Shuffle on" : "Shuffle off"}
              >
                <ShuffleIcon />
              </button>
            </div>
          </div>
        </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          {!isReady ? (
            <p className="text-zinc-500 text-sm">Connecting player...</p>
          ) : !selectedPlaylist ? (
            <p className="text-zinc-500 text-sm">Select a playlist to start playing.</p>
          ) : (
            <p className="text-zinc-500 text-sm">Loading...</p>
          )}
        </div>
      )}
      </div>{/* end now-playing border box */}
      </div>{/* end Now Playing panel-card */}

      {/* ── Section 2: Playlists / Search ─────────────────────────────────── */}
      <div className="panel-card flex flex-col gap-4">

      {/* ─── Tab bar: Playlists | Search ───
          Two tabs below the Now Playing card. The active tab gets a
          brand-orange bottom border and text colour; inactive tabs use
          muted zinc. Content for each tab renders conditionally below. */}
      <div className="flex border-b border-zinc-700">
        <button
          onClick={() => setActiveTab("playlists")}
          className={`flex-1 py-2 text-sm font-semibold uppercase tracking-wider transition-colors ${
            activeTab === "playlists"
              ? "border-b-2 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          style={activeTab === "playlists" ? { borderColor: "var(--brand-orange)", color: "var(--brand-orange)" } : undefined}
        >
          Playlists
        </button>
        <button
          onClick={() => setActiveTab("search")}
          className={`flex-1 py-2 text-sm font-semibold uppercase tracking-wider transition-colors ${
            activeTab === "search"
              ? "border-b-2 text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          style={activeTab === "search" ? { borderColor: "var(--brand-orange)", color: "var(--brand-orange)" } : undefined}
        >
          Search
        </button>
      </div>

      {/* ─── PLAYLISTS TAB ─── */}
      {activeTab === "playlists" && (
        <>
          {/* Playlist selector */}
          <div>
            <label className="theme-header text-sm font-semibold uppercase tracking-wider mb-2 block">
              Playlist
            </label>
            {loadingPlaylists ? (
              <p className="text-zinc-500 text-sm">Loading playlists...</p>
            ) : (
              <select
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
                value={selectedPlaylist?.id ?? ""}
                onChange={(e) => {
                  const playlist = playlists.find((p) => p.id === e.target.value)
                  if (playlist) handlePlayPlaylist(playlist)
                }}
              >
                <option value="" disabled>
                  Select a playlist...
                </option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Up Next queue — shown when there are tracks in the Spotify queue,
              a queued announcement, a queued Closing Time, or a queued search track.
              The Queue box at the top displays the single "priority" queued item
              (announcement, Closing Time, or search track — only one at a time),
              while the track list below shows Spotify's upcoming queue tracks. */}
          {(queue.length > 0 || (announcementStatus === "queued" && queuedAnnouncement) || closingTimeQueued || queuedSearchTrack) && (
            <div>
              <h3 className="theme-header text-sm font-semibold uppercase tracking-wider mb-2">
                Up Next
              </h3>

              {/* Queue box — announcement, Closing Time, or search track queued */}
              {((announcementStatus === "queued" && queuedAnnouncement) || closingTimeQueued || queuedSearchTrack) && (
                <div
                  className="rounded-xl p-3 flex flex-col gap-2 mb-2"
                  style={{ background: "rgba(255,157,26,0.07)", border: "1px solid rgba(255,157,26,0.3)" }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--brand-orange)" }}>
                    Queue
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full animate-pulse shrink-0"
                        style={{ background: "var(--brand-orange)" }}
                      />
                      <span className="text-zinc-200 text-sm font-medium truncate">
                        {closingTimeQueued
                          ? "Closing Time"
                          : queuedSearchTrack
                          ? `${queuedSearchTrack.name} — ${queuedSearchTrack.artists}`
                          : queuedAnnouncement!.file.displayName}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        clearQueue()
                        if (closingTimeQueued) setClosingTimeRemoved(true)
                        setClosingTimeQueued(false)
                        setQueuedSearchTrack(null)
                      }}
                      className="text-xs shrink-0 px-2 py-1 rounded transition-colors hover:text-white"
                      style={{ color: "var(--brand-orange)", border: "1px solid rgba(255,157,26,0.4)" }}
                      title="Remove from queue"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {queue.map((track, i) => (
                  <TrackRow
                    key={`${track.uri}-${i}`}
                    track={track}
                    onPlay={() => handlePlayFromQueue(track.uri)}
                    onSkipToggle={() => handleSkipToggle(track.uri)}
                    formatTime={formatTime}
                    showPlayCount
                    isSkipped={skippedUris.has(track.uri)}
                    isAutoSkipped={
                      !skippedUris.has(track.uri) &&
                      autoSkipEnabled &&
                      getPlayCounts(track.uri).today >= autoSkipThreshold
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── SEARCH TAB ───
          Spotify catalog search. The form submits on Enter or button click.
          Results render as TrackRow components with showActions=true, which
          adds Queue and Play Now buttons (hidden in queue mode). The isQueued
          prop highlights the row with an orange tint and disables both buttons
          when the track is already in the queue, matching the CommercialCard
          "queued" visual state. */}
      {activeTab === "search" && (
        <>
          {/* Search input — form wrapper enables Enter key submission */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch() }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a song or artist..."
              className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-default"
              style={{ background: "var(--brand-orange)", color: "#000" }}
            >
              {searching ? "..." : "Search"}
            </button>
          </form>

          {/* Search results */}
          {searching && (
            <p className="text-zinc-500 text-sm">Searching Spotify...</p>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="space-y-1">
              {searchResults.map((track, i) => (
                <TrackRow
                  key={`${track.uri}-${i}`}
                  track={track}
                  onQueue={() => handleQueueSearchResult(track)}
                  onPlayNow={() => handlePlayNowSearchResult(track.uri)}
                  formatTime={formatTime}
                  showActions
                  isQueued={queuedSearchTrack?.uri === track.uri}
                />
              ))}
            </div>
          )}

          {!searching && searchResults.length === 0 && searchQuery && (
            <p className="text-zinc-500 text-sm text-center py-4">No results found.</p>
          )}
        </>
      )}
      </div>{/* end Playlists/Search panel-card */}

    </div>
  )
}

/** Small stat line shown below artist name on the now-playing card */
function PlayCountLine({ uri }: { uri: string }) {
  const counts: PlayCounts = getPlayCounts(uri)
  if (counts.week === 0) return null

  // Colour + blink based on 6-hour repeat frequency
  const overplayed = counts.sixHours > 2
  const todayColor =
    counts.today >= 3
      ? "text-red-400 font-semibold"
      : counts.today === 2
      ? "text-amber-400"
      : "text-zinc-500"

  return (
    <div className="flex items-center justify-center gap-2 mt-1 text-xs">
      {counts.today > 0 && (
        <span
          className={`${todayColor} ${overplayed ? "blink-alert" : ""}`}
          title={overplayed ? `Played ${counts.sixHours}× in the past 6 hours` : "Times played today"}
        >
          {counts.today}× today
        </span>
      )}
      {counts.today > 0 && counts.week > counts.today && (
        <span className="text-zinc-600">·</span>
      )}
      {counts.week > counts.today && (
        <span className="text-zinc-500" title="Times played in the past 7 days">
          {counts.week}× this week
        </span>
      )}
    </div>
  )
}

/** Small pill badge shown on queue rows */
function PlayCountBadge({ uri }: { uri: string }) {
  const { today } = getPlayCounts(uri)
  if (today === 0) return null

  const style =
    today >= 3
      ? "bg-red-900/60 text-red-300 border border-red-700"
      : today === 2
      ? "bg-amber-900/60 text-amber-300 border border-amber-700"
      : "bg-zinc-700/60 text-zinc-400 border border-zinc-600"

  return (
    <span
      className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${style}`}
      title={`Played ${today}× today`}
    >
      {today}×
    </span>
  )
}

/**
 * Reusable track row used in both the Up Next queue and Search results.
 *
 * This is the shared visual building block for all track listings. It adapts
 * its appearance and interaction model based on two key props:
 *
 * - showActions=false (queue mode): The entire row is clickable (triggers onPlay).
 *   No Queue/Play Now buttons are shown. A play count badge appears on the right.
 *   This is how tracks appear in the Up Next list on the Playlists tab.
 *
 * - showActions=true (search mode): Row click is disabled. Queue and Play Now
 *   buttons appear on the right side. When isQueued=true, both buttons are
 *   disabled and the row gets an orange tint border + background — matching
 *   the CommercialCard "queued" visual state so the entire app has a consistent
 *   "this item is pending" look.
 *
 * Explicit tracks are shown with reduced opacity, strikethrough text, and an "E"
 * badge. They are non-interactive in both modes because the explicit filter will
 * auto-skip them during playback anyway.
 *
 * @param track       — Track data (matches both QueueTrack and SearchTrack shapes)
 * @param onPlay      — Called on row click in queue mode (play this track now)
 * @param onQueue     — Called by Queue button in search mode
 * @param onPlayNow   — Called by Play Now button in search mode
 * @param formatTime  — Formats milliseconds to "M:SS" for the duration label
 * @param showPlayCount — Show the play count badge (queue mode only)
 * @param showActions — Show Queue / Play Now buttons (search mode only)
 * @param isQueued    — Orange highlight + disabled buttons when true
 */
/**
 * Reusable track row used in both the Up Next queue and Search results.
 *
 * Adapts its appearance and interaction model based on props:
 *
 * - showActions=false (queue mode): Entire row is clickable (triggers onPlay).
 *   No Queue/Play Now buttons. Play count badge, Skip/Add button, and duration
 *   appear on the right. Skipped tracks are dimmed and non-interactive.
 *
 * - showActions=true (search mode): Row click disabled. Queue and Play Now
 *   buttons appear on the right. No Skip button (skip is queue-mode only).
 *
 * Visual states for queue tracks (priority order):
 *   1. Explicit  → left content opacity-40, strikethrough, "E" badge, non-clickable
 *   2. Skipped   → left content opacity-40, strikethrough, "Add" button, non-clickable
 *   3. Queued    → orange tint border + background
 *   4. Normal    → hover-brand orange border on hover, cursor-pointer
 *
 * The Skip/Add button and duration are always rendered outside the dimmable
 * left section so they remain at full opacity and are always clickable — even
 * when the track content is faded to 40%.
 */
function TrackRow({
  track,
  onPlay,
  onQueue,
  onPlayNow,
  onSkipToggle,
  formatTime,
  showPlayCount = false,
  showActions = false,
  isQueued = false,
  isSkipped = false,
  isAutoSkipped = false,
}: {
  track: { uri: string; name: string; artists: string; explicit: boolean; albumArt: string; duration: number }
  onPlay?: () => void
  onQueue?: () => void
  onPlayNow?: () => void
  onSkipToggle?: () => void
  formatTime: (ms: number) => string
  showPlayCount?: boolean
  showActions?: boolean
  isQueued?: boolean
  isSkipped?: boolean
  /** True when auto-skip-by-play-count is active and this track exceeds the threshold */
  isAutoSkipped?: boolean
}) {
  // Whether the track content should appear dimmed
  const isDimmed = track.explicit || isSkipped || isAutoSkipped

  // Container: non-interactive for explicit/skipped/auto-skipped; orange tint for queued; hover for normal
  const containerClass = track.explicit || isSkipped || isAutoSkipped
    ? "cursor-default border-transparent"
    : isQueued
    ? "" // styled via inline style below
    : showActions
    ? "border border-zinc-700/60 bg-zinc-800/40 hover-brand"
    : "hover-brand bg-zinc-800/40 border-zinc-700/50 cursor-pointer"

  const rowStyle = isQueued && !isDimmed && !isAutoSkipped
    ? { border: "1px solid rgba(255,157,26,0.35)", background: "rgba(255,157,26,0.07)" }
    : undefined

  const titleText = track.explicit
    ? "Explicit — will be skipped automatically"
    : isSkipped
    ? "Skipped — will not play today (press Add to restore)"
    : isAutoSkipped
    ? "Played too many times today — will be auto-skipped (adjust threshold in Settings)"
    : showActions ? undefined : "Click to play"

  return (
    <div
      onClick={() => !isDimmed && !isAutoSkipped && !showActions && onPlay?.()}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors ${containerClass}`}
      style={rowStyle}
      title={titleText}
    >
      {/* ── Left section: dims when explicit or skipped ── */}
      <div className={`flex items-center gap-3 flex-1 min-w-0 ${isDimmed ? "opacity-40" : ""}`}>
        {/* Small album art */}
        {track.albumArt ? (
          <div className="relative w-8 h-8 rounded shrink-0 overflow-hidden">
            <Image src={track.albumArt} alt={track.name} fill className="object-cover" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded shrink-0 bg-zinc-700" />
        )}

        {/* Track name + artist */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-tight truncate ${isDimmed ? "line-through text-zinc-500" : "text-white"}`}>
            {track.name}
          </p>
          <p className="text-xs text-zinc-500 truncate">{track.artists}</p>
        </div>

        {/* Explicit badge */}
        {track.explicit && (
          <span className="shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-zinc-700 text-zinc-400" title="Explicit — will be skipped">
            E
          </span>
        )}

        {/* Search action buttons — inside dimmable area; not shown for explicit/skipped */}
        {showActions && !track.explicit && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onQueue?.() }}
              disabled={isQueued}
              className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Add to queue — plays after current song"
            >
              Queue
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPlayNow?.() }}
              disabled={isQueued}
              className="text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Play now — fades out current track, plays this song, then resumes playlist"
            >
              Play Now
            </button>
          </div>
        )}
      </div>

      {/* ── Right section: always full opacity ── */}

      {/* Play count badge — queue mode only */}
      {showPlayCount && !track.explicit && <PlayCountBadge uri={track.uri} />}

      {/* Skip / Add toggle — queue mode only; not shown for explicit tracks or
          auto-skipped-by-count tracks (those are controlled via Settings threshold) */}
      {showPlayCount && !track.explicit && !isAutoSkipped && (
        <button
          onClick={(e) => { e.stopPropagation(); onSkipToggle?.() }}
          className={`text-xs px-2 py-1 rounded transition-colors shrink-0 text-zinc-500 border border-zinc-700 hover:text-white hover:border-zinc-500`}
          title={isSkipped ? "Restore — track will play again" : "Skip — dims track and auto-skips if it comes up today"}
        >
          {isSkipped ? "Add" : "Skip"}
        </button>
      )}

      {/* Duration — always rightmost */}
      <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{formatTime(track.duration)}</span>
    </div>
  )
}

function SpotifyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6l6-4.269V16.27L8.5 12zM16 6h2v12h-2z" />
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  )
}
