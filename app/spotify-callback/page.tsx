"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { exchangeCodeForToken } from "@/lib/spotify-auth"
import { useSpotifyStore } from "@/lib/spotify-store"

export default function SpotifyCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setTokens = useSpotifyStore((s) => s.setTokens)

  useEffect(() => {
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
      console.error("Spotify auth error:", error)
      router.replace("/")
      return
    }

    if (!code) {
      router.replace("/")
      return
    }

    exchangeCodeForToken(code)
      .then((tokens) => {
        setTokens(tokens)
        router.replace("/")
      })
      .catch((err) => {
        console.error("Token exchange failed:", err)
        router.replace("/")
      })
  }, [searchParams, router, setTokens])

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-400 text-sm">Connecting Spotify...</p>
    </main>
  )
}
