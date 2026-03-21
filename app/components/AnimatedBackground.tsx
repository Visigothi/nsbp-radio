"use client"

/**
 * Animated background: three slowly drifting radial light blobs
 * (warm orange + cool neutral) layered over a black base.
 * Fine contour lines add texture at very low opacity.
 * Background stays predominantly black; blobs are 8–13% opacity.
 */
export default function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: 0, opacity: "var(--bg-opacity, 1)" } as React.CSSProperties}
    >
      {/* Blob A — large warm orange glow, lower-left */}
      <div
        className="absolute blob-a"
        style={{
          width: "150vw",
          height: "130vh",
          left: "-40vw",
          top: "0vh",
          background:
            "radial-gradient(ellipse at center, rgba(255,157,26,0.13) 0%, rgba(255,157,26,0.05) 45%, transparent 72%)",
        }}
      />

      {/* Blob B — cool blue-white accent, upper-right, 90s drift */}
      <div
        className="absolute blob-b"
        style={{
          width: "110vw",
          height: "100vh",
          right: "-20vw",
          top: "-20vh",
          background:
            "radial-gradient(ellipse at center, rgba(190,210,255,0.07) 0%, rgba(190,210,255,0.02) 50%, transparent 70%)",
        }}
      />

      {/* Blob C — secondary orange bloom, center-right, 110s drift */}
      <div
        className="absolute blob-c"
        style={{
          width: "100vw",
          height: "90vh",
          right: "-10vw",
          bottom: "-15vh",
          background:
            "radial-gradient(ellipse at center, rgba(255,157,26,0.08) 0%, transparent 65%)",
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
            rgba(255,157,26,0.025) 130px
          )`,
        }}
      />
    </div>
  )
}
