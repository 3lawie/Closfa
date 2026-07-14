// Pure drawing routine, deliberately DOM/Worker-agnostic (only touches the
// 2D context it's handed) so the exact same code path renders the wave both
// off-main-thread (audioWave.worker.ts, via OffscreenCanvasRenderingContext2D)
// and on the main thread when a browser lacks Worker/OffscreenCanvas support
// (AudioSlide's fallback in PostCard.tsx) — one visual, two possible hosts.

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const RING_COUNT = 5
const RING_POINTS = 72
const PARTICLE_COUNT = 7
// Ellipse squash on the y-axis reads as looking down at the water from a
// slight angle rather than a flat overhead radar view — a perfect circle
// looks static; this makes the same ripple visibly recede "into" the card.
const SQUASH = 0.82

function drawRipples(ctx: Ctx2D, width: number, height: number, clock: number, level: number, opacity: number, accentColor: string): void {
  if (opacity <= 0.002) return
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.min(width, height) * 0.58
  const wobbleAmp = maxRadius * (0.015 + level * 0.05)

  for (let i = RING_COUNT - 1; i >= 0; i--) {
    const phase = (clock + i / RING_COUNT) % 1
    const radius = phase * maxRadius
    const fade = 1 - phase
    const ringOpacity = fade * (0.18 + level * 0.35) * opacity
    if (radius < 2 || ringOpacity <= 0.01) continue

    ctx.save()
    ctx.globalAlpha = ringOpacity
    ctx.strokeStyle = accentColor
    ctx.lineWidth = Math.max(1, maxRadius * 0.006 * fade + level * maxRadius * 0.004)
    // Depth cue: a soft shadow beneath each ring, as if it's a raised
    // ripple catching light from directly above.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = maxRadius * 0.02 * fade
    ctx.shadowOffsetY = maxRadius * 0.008 * fade

    // Wobble ramps IN as the ring expands (0 at spawn, full by a third of
    // the way out) rather than being strongest at radius≈0 — full-amplitude
    // wobble on a barely-formed ring made it read as a jagged star clinging
    // to the button instead of a ripple that starts clean and roughens as
    // it travels.
    const wobbleScale = Math.min(1, phase * 3)
    ctx.beginPath()
    for (let p = 0; p <= RING_POINTS; p++) {
      const angle = (p / RING_POINTS) * Math.PI * 2
      const wobble = Math.sin(angle * 5 + clock * 3 + i * 1.3) * wobbleAmp * wobbleScale
      const r = radius + wobble
      const x = cx + Math.cos(angle) * r
      const y = cy + Math.sin(angle) * r * SQUASH
      if (p === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }

  // Layered translucent ellipses instead of a true alpha gradient — avoids
  // needing to parse/rebuild arbitrary accentColor formats (hex, oklch,
  // css vars) into rgba stops, while still reading as a soft glow at the
  // ripple's origin. Fixed radius, not level-driven — the island itself
  // stays put; the rings are what carry the audio-reactive movement, so the
  // glow doesn't pulse/bounce in sync with every amplitude change.
  const glowRadius = maxRadius * 0.24
  ctx.save()
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = ((0.05 + level * 0.09) / i) * opacity
    ctx.fillStyle = accentColor
    ctx.beginPath()
    ctx.ellipse(cx, cy, glowRadius * (i / 3), glowRadius * (i / 3) * SQUASH, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Specular glint offset toward the upper-left, as if an overhead light is
  // catching the water's surface — this single highlight does more for the
  // "looking down at water" 3D read than the rings and glow alone.
  ctx.save()
  ctx.globalAlpha = (0.12 + level * 0.1) * opacity
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(
    cx - glowRadius * 0.35,
    cy - glowRadius * 0.45 * SQUASH,
    glowRadius * 0.4,
    glowRadius * 0.4 * SQUASH * 0.6,
    -0.4,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()
}

// Deliberately a different animation from the ripples, not just a quieter
// version of it — a handful of soft motes drifting in slow elliptical
// orbits around a static (non-pulsing) central glow marking the island
// itself, so pausing reads as "the card switched to an ambient idle state"
// rather than "the music just went quiet." Nothing here reacts to audio;
// it's pure environment. The island glow deliberately does NOT breathe or
// resize — only the motes carry the motion, so the island itself reads as a
// fixed point rather than something bobbing.
function drawIdleDrift(ctx: Ctx2D, width: number, height: number, clock: number, opacity: number, accentColor: string): void {
  if (opacity <= 0.002) return
  const cx = width / 2
  const cy = height / 2
  const maxRadius = Math.min(width, height) * 0.58

  const glowRadius = maxRadius * 0.2
  ctx.save()
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = (0.045 / i) * opacity
    ctx.fillStyle = accentColor
    ctx.beginPath()
    ctx.ellipse(cx, cy, glowRadius * (i / 3), glowRadius * (i / 3) * SQUASH, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const seed = i * 1.913
    const orbitRadius = maxRadius * (0.28 + 0.55 * ((i % 4) / 3))
    const speed = 0.035 + (i % 3) * 0.012
    const angle = clock * speed + seed
    const x = cx + Math.cos(angle) * orbitRadius
    const y = cy + Math.sin(angle) * orbitRadius * SQUASH
    const twinkle = 0.5 + 0.5 * Math.sin(clock * 0.7 + seed * 3)
    const r = maxRadius * (0.01 + 0.008 * twinkle)

    // Kept subtle in both themes — matches how faint these already read
    // against a light background, rather than the brighter, more assertive
    // look they had against dark surfaces before.
    ctx.save()
    ctx.globalAlpha = (0.045 + 0.07 * twinkle) * opacity
    ctx.fillStyle = accentColor
    ctx.shadowColor = accentColor
    ctx.shadowBlur = r * 3
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * Draws the audio card's background animation — concentric ripples radiating
 * from the center while playing (like ripples spreading around an island,
 * `level` 0..1 driving wobble/brightness so louder audio reads as more
 * energetic), crossfading into a calm, unrelated ambient idle animation
 * (a static island glow + drifting motes) while paused. These are
 * deliberately two different animations, not the same one turned down, so
 * pausing visibly changes what the card is doing rather than just quieting
 * it — `transition` is what turns that swap into a dissolve instead of a cut.
 *
 * Both `clock` and `transition` must be values the caller accumulates
 * frame-by-frame (e.g. `clock += dt * speed`, `transition += (target -
 * transition) * rate`), NOT recomputed from a raw wall-clock timestamp each
 * call — level (and therefore intended ring speed) changes constantly once
 * real music is playing, and recomputing phase as `elapsedTime *
 * currentSpeed` on every call would rescale the entire elapsed history each
 * time speed changes, making the animation jump to a wildly different phase
 * on every fluctuation instead of continuing smoothly from wherever it
 * already was.
 *
 * `transition`: 0 = fully idle, 1 = fully playing. Both animations keep
 * advancing their own clocks even while fully transparent, so whichever one
 * fades back in next continues from wherever it left off rather than
 * snapping to a fresh start.
 */
export function drawWave(
  ctx: Ctx2D,
  width: number,
  height: number,
  clock: number,
  level: number,
  transition: number,
  accentColor: string,
): void {
  ctx.clearRect(0, 0, width, height)
  drawIdleDrift(ctx, width, height, clock, 1 - transition, accentColor)
  drawRipples(ctx, width, height, clock, level, transition, accentColor)
}

/**
 * Reduces a raw frequency-bin snapshot from an AnalyserNode down to a single
 * 0..1 loudness value, biased toward the lower ~40% of bins — that's where
 * music's perceptible bass/mid energy actually lives; the option was
 * copied forward from the equalizer this replaced, where sampling the full
 * spectrum evenly left the reading dominated by near-silent high frequencies.
 */
export function bandLevel(data: Uint8Array): number {
  const n = Math.max(1, Math.floor(data.length * 0.4))
  let sum = 0
  for (let i = 0; i < n; i++) sum += data[i]
  return sum / n / 255
}
