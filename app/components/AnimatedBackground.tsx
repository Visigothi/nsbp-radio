"use client"

/**
 * Subtle animated background: slowly drifting near-horizontal contour lines
 * at 1-3° offsets (never perfectly straight, per brand guidelines).
 * Three independent layers — white and brand-orange — at different speeds.
 * Background stays black; lines are 2-4% opacity so content always dominates.
 */
export default function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* Layer A — white lines, 1.5° off horizontal, 60px spacing, drifts up-right */}
      <div
        className="absolute inset-0 contour-a"
        style={{
          backgroundImage: `repeating-linear-gradient(
            88.5deg,
            transparent 0px,
            transparent 58px,
            rgba(255, 255, 255, 0.038) 59px,
            rgba(255, 255, 255, 0.038) 60px
          )`,
        }}
      />

      {/* Layer B — brand-orange lines, 0.7° off horizontal, 90px spacing, drifts down-left */}
      <div
        className="absolute inset-0 contour-b"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90.7deg,
            transparent 0px,
            transparent 88px,
            rgba(255, 157, 26, 0.028) 89px,
            rgba(255, 157, 26, 0.028) 90px
          )`,
        }}
      />

      {/* Layer C — fine white lines, 2.2° off horizontal, 130px spacing, drifts up slowly */}
      <div
        className="absolute inset-0 contour-c"
        style={{
          backgroundImage: `repeating-linear-gradient(
            89.1deg,
            transparent 0px,
            transparent 128px,
            rgba(255, 255, 255, 0.022) 129px,
            rgba(255, 255, 255, 0.022) 130px
          )`,
        }}
      />

      {/* Layer D — sparse brand-orange accent lines, 1.8° off, 200px spacing */}
      <div
        className="absolute inset-0 contour-d"
        style={{
          backgroundImage: `repeating-linear-gradient(
            91.8deg,
            transparent 0px,
            transparent 198px,
            rgba(255, 157, 26, 0.018) 199px,
            rgba(255, 157, 26, 0.018) 200px
          )`,
        }}
      />
    </div>
  )
}
