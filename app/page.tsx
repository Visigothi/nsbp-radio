/**
 * page.tsx — Root page (the entire app lives here)
 *
 * This is a Next.js Server Component — it runs on the server for every
 * page load. It checks the Google session via auth() and redirects
 * unauthenticated visitors to /login before anything renders.
 *
 * Layout structure:
 *   <main>
 *     <AnimatedBackground />   ← Fixed position behind everything (z-0)
 *     <header>                 ← Logo, wordmark, user email, sign out, version
 *     <div>                    ← z-10 wrapper, contains AppShell
 *       <AppShell />           ← Two-panel interactive layout
 *
 * The "Sign out" button uses a Next.js Server Action (the inline async
 * function with "use server") to call NextAuth's signOut() server-side
 * and redirect to /login. This avoids exposing a client-side API route
 * for the sign-out action.
 *
 * The version number is defined in SettingsModal.tsx as APP_VERSION.
 * Update it there whenever a significant change is deployed. Format: vX.Y.Z BETA
 */

import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Image from "next/image"
import AppShell from "./components/AppShell"
import AnimatedBackground from "./components/AnimatedBackground"
import SettingsModal from "./components/SettingsModal"

export default async function Home() {
  // auth() reads the NextAuth session from the encrypted cookie.
  // If no valid session exists, redirect to the login page immediately.
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <main className="min-h-screen bg-black text-white flex flex-col relative">

      {/* Animated background — fixed position, pointer-events disabled, z-0 */}
      <AnimatedBackground />

      {/* ── Top navigation bar ─────────────────────────────────────────── */}
      {/* Glassmorphism effect: semi-transparent black + backdrop blur */}
      <header
        className="relative z-10 flex items-center justify-between px-5 py-2 shrink-0"
        style={{
          borderBottom: "1px solid var(--accent-border)",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Left: NSBP logo image + "North Shore Bike Park Radio" wordmark */}
        <div className="flex items-center gap-4">
          {/*
            Logo image — priority loaded to avoid layout shift on first paint.

            sizes="224px" tells Next.js the rendered width so it generates
            the correct srcset rather than defaulting to viewport-width breakpoints.

            unoptimized bypasses Next.js Image Optimization, which causes
            404 errors on PNG files under Turbopack in Next.js 16 dev mode.
            The logo is already a small static asset so optimization is unnecessary.
          */}
          <div className="relative h-[72px] w-56 shrink-0">
            <Image
              src="/nsbp-logo.png"
              alt="North Shore Bike Park"
              fill
              sizes="224px"
              className="object-contain object-left"
              priority
              unoptimized
            />
          </div>
          {/* Wordmark: white "North Shore Bike Park" + brand-orange "Radio" */}
          <div className="flex items-baseline gap-2 leading-none">
            <span className="text-white font-bold text-xl tracking-tight">
              North Shore Bike Park
            </span>
            <span
              className="font-bold text-xl tracking-tight"
              style={{ color: "var(--brand-orange)" }}
            >
              Radio
            </span>
          </div>
        </div>

        {/*
          Right: settings gear icon — opens modal with Google account,
          sign out, version number, announcement volume, and Spotify account.

          The signOutAction is defined here as a Server Action (inline async
          with "use server") and passed as a prop to the Client Component.
          Next.js App Router serializes Server Actions for use in Client Components.
        */}
        <SettingsModal
          email={session.user?.email}
          signOutAction={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        />
      </header>

      {/* ── Main content — z-10 so it sits above the animated background ── */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        <AppShell />
      </div>

    </main>
  )
}
