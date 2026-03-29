# Changelog

## v1.6.3

| Feature | Details |
|---|---|
| **UI Themes** | Three selectable themes in Settings → Theme dropdown: North Shore (default — dark/black, warm orange), Mackenzie (pink accent palette, bright pink section headers and Now Playing border), Eli (bold black, bright `#FF9000` orange, 3px thick borders, peach `#FFCBA4` Now Playing fill). Theme persisted to localStorage via `lib/theme-store.ts` (Zustand). Applied as `data-theme` on `<html>` by AppShell.tsx. |
| **Theme-aware CSS system** | CSS custom property overrides in `globals.css` per `[data-theme]` selector. `--color-orange-*` vars replaced per theme, switching all Tailwind `orange-*` utilities automatically. Blob vars, Now Playing border/width/bg, section headers (`.theme-header`), and button borders all theme-aware. |
| **Eli theme button styling** | Skip, Queue, and Play Now buttons in Eli theme render with 3px solid `#FF9000` border, black background, bold white text. Queue/Play Now buttons gained `border border-zinc-700` class so the `button[class*="border"]` CSS rule applies. Eli rule also overrides `background: #000`. |

## v1.6.2

| Feature | Details |
|---|---|
| **Remove admin** | Owner can remove any invited admin via a Remove button (with confirmation dialog). Owner cannot remove themselves. |
| **Transfer ownership** | Owner can promote any admin to Owner via a role dropdown (with confirmation dialog). Previous owner is demoted to Admin. Only one Owner at a time. Non-owners cannot see or use these controls. |
| **Role column in admin_users** | `role TEXT NOT NULL DEFAULT 'admin'` column added to `admin_users` table. DB `role='owner'` takes precedence over `ADMIN_EMAIL` env var for owner resolution; env var remains as bootstrap fallback. |

## v1.6.1

| Feature | Details |
|---|---|
| **Announcement analytics** | Drive MP3 announcements are tracked in `track_plays` with `play_type = 'announcement'`; displayed in orange in the admin dashboard |
| **Admin invite system** | Admin Access tab in the dashboard — invite Google accounts to the admin panel via `admin_users` table; takes effect immediately |
| **Admin dashboard tab UI** | Track Analytics and Admin Access are now tabs (client component `AdminTabs.tsx`); data is all server-fetched, tab switching is instant |
| **Browser tab title** | `/admin` now shows "NSBP Radio Administrator" in the browser tab via Next.js `metadata` export |
