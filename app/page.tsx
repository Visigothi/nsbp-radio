import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">NSBP Radio</h1>
          <p className="text-zinc-400 text-sm">Signed in as {session.user?.email}</p>
        </div>
        <form
          action={async () => {
            "use server"
            await signOut({ redirectTo: "/login" })
          }}
        >
          <button
            type="submit"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
      <p className="text-zinc-500 text-sm">App coming soon — Phase 2 auth complete.</p>
    </main>
  )
}
