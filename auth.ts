/**
 * auth.ts — NextAuth.js v5 configuration
 *
 * Handles Google OAuth for staff login. Only email addresses listed in the
 * ALLOWED_EMAILS environment variable (comma-separated) are permitted to
 * sign in. Unrecognised accounts are rejected at the signIn callback.
 *
 * Google Drive access:
 *   The "drive.readonly" scope is requested so that the logged-in user's
 *   Google session can be used server-side to list and stream MP3 files
 *   from the shared announcements folder — no separate service account needed.
 *
 * Token auto-refresh:
 *   Google access tokens expire after one hour. If the user stays logged in
 *   longer than that, the jwt callback automatically refreshes the token using
 *   the stored refresh_token so Drive API calls keep working without forcing
 *   the user to sign out and back in.
 *
 * Environment variables required:
 *   GOOGLE_CLIENT_ID        — from Google Cloud Console OAuth credentials
 *   GOOGLE_CLIENT_SECRET    — from Google Cloud Console OAuth credentials
 *   ALLOWED_EMAILS          — comma-separated list of permitted email addresses
 *                             (comparison is case-insensitive)
 *   AUTH_SECRET             — random secret for signing NextAuth JWTs
 */

import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

/**
 * Calls Google's token endpoint to exchange a refresh_token for a new
 * access_token. Called automatically by the jwt callback when the stored
 * access token is within 60 seconds of expiry.
 *
 * Returns the new accessToken, its expiry timestamp (ms), and the
 * refresh_token (Google may rotate it; we keep the old one if not).
 */
async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string
  accessTokenExpires: number
  refreshToken: string
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error}`)

  return {
    accessToken: data.access_token,
    // expires_in is in seconds; convert to an absolute ms timestamp
    accessTokenExpires: Date.now() + data.expires_in * 1000,
    // Google doesn't always rotate the refresh token; keep the old one if absent
    refreshToken: data.refresh_token ?? refreshToken,
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Request read-only Drive access in addition to the standard
          // openid/email/profile scopes so server-side API routes can
          // list and proxy files from the announcements Google Drive folder.
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.readonly",
          // "offline" ensures Google returns a refresh_token on first sign-in.
          access_type: "offline",
          // "consent" forces the consent screen every time, which guarantees
          // a fresh refresh_token even for users who previously authorised the app.
          prompt: "consent",
        },
      },
    }),
  ],

  callbacks: {
    /**
     * signIn callback — allowlist gate.
     * Called immediately after Google confirms the user's identity.
     * Returns true to allow sign-in or false to block it.
     * Comparison is lowercased so "Mike@WestCoastBikeParks.ca" matches
     * "mike@westcoastbikeparks.ca" in the env var.
     */
    async signIn({ user }) {
      const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      return allowedEmails.includes((user.email ?? "").toLowerCase())
    },

    /**
     * jwt callback — stores and refreshes the Google access token.
     * Called every time a JWT is created or read.
     *
     * On first sign-in (account is present): store the access_token,
     * refresh_token, and expiry from the OAuth response directly on the JWT.
     *
     * On subsequent calls: if the token is still valid (with a 60-second
     * safety buffer), return it unchanged. If it's expired, call
     * refreshGoogleToken() and update the JWT with the new credentials.
     * If the refresh fails, set error: "RefreshAccessTokenError" so the
     * session layer can signal the UI to prompt re-login.
     */
    async jwt({ token, account }) {
      // First sign-in: persist all Spotify-related tokens from the OAuth response
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          // expires_at from NextAuth is in seconds; convert to ms
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
        }
      }

      // Token still valid — return it as-is (60s buffer to avoid edge-case expiry)
      const expires = token.accessTokenExpires as number | undefined
      if (expires && Date.now() < expires - 60_000) {
        return token
      }

      // Token expired — attempt to refresh using the stored refresh_token
      const refreshToken = token.refreshToken as string | undefined
      if (!refreshToken) {
        // No refresh token means the user must sign in again
        return { ...token, error: "NoRefreshToken" }
      }

      try {
        const refreshed = await refreshGoogleToken(refreshToken)
        return {
          ...token,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessTokenExpires: refreshed.accessTokenExpires,
          error: undefined, // clear any previous error
        }
      } catch (err) {
        console.error("[auth] Token refresh failed:", err)
        return { ...token, error: "RefreshAccessTokenError" }
      }
    },

    /**
     * session callback — exposes the Google access token to server components.
     * The default NextAuth session does not include the access token; we
     * explicitly copy it from the JWT so server-side API routes can use it
     * to call the Google Drive API on the user's behalf.
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined
      session.error = token.error as string | undefined
      return session
    },
  },

  // Custom pages override NextAuth's built-in login/error UI
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
