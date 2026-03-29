"use client"

/**
 * Animated background: three slowly drifting radial light blobs
 * layered over a black base. Fine contour lines add texture at very low opacity.
 * Background stays predominantly black; blobs are 8–13% opacity.
 *
 * Blob colours use CSS variables (--blob-*) defined in globals.css so they
 * switch automatically when the active theme changes via data-theme on <html>.
 */
export default function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: 0, opacity: "var(--bg-opacity, 1)" } as React.CSSProperties}
    >
      {/* Blob A — large warm glow, lower-left */}
      <div
        className="absolute blob-a"
        style={{
          width: "150vw",
          height: "130vh",
          left: "-40vw",
          top: "0vh",
          background:
            "radial-gradient(ellipse at center, var(--blob-a-1) 0%, var(--blob-a-2) 45%, transparent 72%)",
        }}
      />

      {/* Blob B — cool accent, upper-right, 90s drift */}
      <div
        className="absolute blob-b"
        style={{
          width: "110vw",
          height: "100vh",
          right: "-20vw",
          top: "-20vh",
          background:
            "radial-gradient(ellipse at center, var(--blob-b-1) 0%, var(--blob-b-2) 50%, transparent 70%)",
        }}
      />

      {/* Blob C — secondary bloom, center-right, 110s drift */}
      <div
        className="absolute blob-c"
        style={{
          width: "100vw",
          height: "90vh",
          right: "-10vw",
          bottom: "-15vh",
          background:
            "radial-gradient(ellipse at center, var(--blob-c-1) 0%, transparent 65%)",
        }}
      />

      {/* Texture layer — very fine near-horizontal lines for depth */}
      <div
        className="absolute inset-0 contour-a"
        style={{
          backgroundImage: `repeating-linear-gradient(
            88.5deg,
            transparent 0px,
            transparent 59px,
            rgba(255,255,255,0.03) 60px
          )`,
        }}
      />
      <div
        className="absolute inset-0 contour-c"
        style={{
          backgroundImage: `repeating-linear-gradient(
            89.3deg,
            transparent 0px,
            transparent 129px,
            var(--blob-line) 130px
          )`,
        }}
      />
    </div>
  )
}
