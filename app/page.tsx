import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import Image from "next/image"
import AppShell from "./components/AppShell"
import AnimatedBackground from "./components/AnimatedBackground"

export default async function Home() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <main className="min-h-screen bg-black text-white flex flex-col relative">
      {/* Animated background — sits behind everything */}
      <AnimatedBackground />

      {/* Top bar */}
      <header
        className="relative z-10 flex items-center justify-between px-5 py-2 shrink-0"
        style={{
          borderBottom: "1px solid rgba(255, 157, 26, 0.2)",
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Left: logo + wordmark */}
        <div className="flex items-center gap-4">
          <div className="relative h-[72px] w-56 shrink-0">
            <Image
              src="/nsbp-logo.png"
              alt="North Shore Bike Park"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
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

        {/* Right: user + sign out */}
        <div className="flex items-center gap-4">
          <span className="text-zinc-500 text-xs hidden sm:inline">
            {session.user?.email}
          </span>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <button
              type="submit"
              className="text-xs text-zinc-500 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Main two-panel layout */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        <AppShell />
      </div>
    </main>
  )
}
