"use client"

import { useSpotifyStore } from "@/lib/spotify-store"
import { useCommercialStore } from "@/lib/commercial-store"
import { initiateSpotifyAuth, clearSpotifyTokens } from "@/lib/spotify-auth"

export default function SpotifyAccountSection() {
  const { tokens, spotifyUser, player, clearTokens } = useSpotifyStore()
  const { clearQueue } = useCommercialStore()

  const handleDisconnect = () => {
    player?.disconnect()
    clearTokens()
    clearQueue()
    clearSpotifyTokens()
  }

  const handleSwitch = () => {
    player?.disconnect()
    clearTokens()
    clearQueue()
    clearSpotifyTokens()
    // show_dialog forces Spotify to show the account chooser
    initiateSpotifyAuth({ showDialog: true })
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,157,26,0.10)" }}>
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3">
        Spotify Account
      </h2>

      {tokens ? (
        <div
          className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2.5 flex items-center gap-3"
        >
          {/* Spotify logo mark */}
          <svg className="w-5 h-5 shrink-0 text-green-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>

          {/* Account identity */}
          <div className="flex-1 min-w-0">
            {spotifyUser ? (
              <>
                <p className="text-sm text-white font-medium truncate">{spotifyUser.displayName}</p>
                {spotifyUser.email && (
                  <p className="text-xs text-zinc-400 truncate">{spotifyUser.email}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-400">Connected</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleSwitch}
              className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
              title="Log out of Spotify and sign in with a different account"
            >
              Switch
            </button>
            <button
              onClick={handleDisconnect}
              className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
              title="Disconnect Spotify from this app"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2.5 flex items-center justify-between gap-3"
        >
          <p className="text-sm text-zinc-400">Not connected</p>
          <button
            onClick={() => initiateSpotifyAuth()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Connect Spotify
          </button>
        </div>
      )}
    </div>
  )
}
