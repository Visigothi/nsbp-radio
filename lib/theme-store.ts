"use client"

/**
 * theme-store.ts — Zustand store for the active UI theme
 *
 * Themes change the accent colour palette and animated background colours
 * without affecting any Spotify or audio state.
 *
 * Themes:
 *   north-shore — dark/black background, warm orange accents (default)
 *   mackenzie   — dark background, pink accent palette
 *
 * The active theme is applied as a `data-theme` attribute on <html> by
 * AppShell.tsx, which causes CSS variable overrides in globals.css to take
 * effect. All Tailwind orange-* utilities are wired to those vars via
 * `@theme inline`, so every orange element in the UI switches automatically.
 */

import { create } from "zustand"

export type Theme = "north-shore" | "mackenzie" | "eli"

export const THEMES: { id: Theme; label: string }[] = [
  { id: "north-shore", label: "North Shore" },
  { id: "mackenzie",   label: "Mackenzie" },
  { id: "eli",        label: "Eli" },
]

const LS_KEY = "nsbp_theme"

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "north-shore"
  const saved = localStorage.getItem(LS_KEY)
  if (saved === "mackenzie" || saved === "eli") return saved
  return "north-shore"
}

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, theme)
    }
    set({ theme })
  },
}))
