import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

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
    accessTokenExpires: Date.now() + data.expires_in * 1000,
    refreshToken: data.refresh_token ?? refreshToken, // keep old one if not rotated
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",  // ensures a refresh_token is returned
          prompt: "consent",       // forces refresh_token even for returning users
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      return allowedEmails.includes(user.email ?? "")
    },

    async jwt({ token, account }) {
      // First sign-in: store tokens and expiry
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
        }
      }

      // Token still valid (60s buffer)
      const expires = token.accessTokenExpires as number | undefined
      if (expires && Date.now() < expires - 60_000) {
        return token
      }

      // Token expired — refresh it
      const refreshToken = token.refreshToken as string | undefined
      if (!refreshToken) {
        return { ...token, error: "NoRefreshToken" }
      }

      try {
        const refreshed = await refreshGoogleToken(refreshToken)
        return {
          ...token,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessTokenExpires: refreshed.accessTokenExpires,
          error: undefined,
        }
      } catch (err) {
        console.error("[auth] Token refresh failed:", err)
        return { ...token, error: "RefreshAccessTokenError" }
      }
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined
      session.error = token.error as string | undefined
      return session
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
