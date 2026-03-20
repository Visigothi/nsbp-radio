import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import AppShell from "./components/AppShell"

export default async function Home() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-tight">NSBP Radio</span>
          <span className="text-zinc-600 text-xs hidden sm:inline">North Shore Bike Park</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-zinc-500 text-xs hidden sm:inline">{session.user?.email}</span>
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
      <AppShell />
    </main>
  )
}
