/**
 * POST /api/track-play
 *
 * Records a play event to Supabase. Handles both Spotify tracks and Drive
 * announcements — callers pass an optional playType to distinguish them.
 *
 * Called by:
 *   - usePlayHistory (lib/use-play-history.ts) after a Spotify track has been
 *     playing for 5+ seconds. playType defaults to "track".
 *   - useCommercialEngine (lib/use-commercial-engine.ts) when an announcement
 *     starts playing. playType is "announcement".
 *
 * Protected by the NextAuth session middleware — only authenticated users
 * can call this endpoint.
 */

import { supabase } from "@/lib/supabase"
import { NextResponse } from "next/server"

interface TrackPlayBody {
  trackId: string
  trackName: string
  artistName: string
  /** Discriminates Spotify tracks from Drive announcements. Defaults to "track". */
  playType?: "track" | "announcement"
}

export async function POST(req: Request) {
  let body: TrackPlayBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { trackId, trackName, artistName, playType = "track" } = body
  if (!trackId || !trackName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // DEV-ONLY: tag each row with environment + instance so multiple deployments
  // sharing one Supabase project don't mix analytics.
  // TODO (multi-park): replace with one Supabase project per park (Option A)
  // and remove the environment + instance_id columns at that time.
  const environment = process.env.NODE_ENV === "production" ? "prod" : "dev"
  const instanceId = process.env.INSTANCE_ID ?? "default"

  const { error } = await supabase.from("track_plays").insert({
    track_id: trackId,
    track_name: trackName,
    // artist_name is empty string for announcements (Drive files have no artist)
    artist_name: artistName ?? "",
    play_type: playType,
    environment,
    instance_id: instanceId,
  })

  if (error) {
    console.error("[track-play] Supabase insert error:", error)
    return NextResponse.json({ error: "Failed to record play" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
