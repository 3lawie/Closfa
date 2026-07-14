// ──────────────────────────────────────────────────────────────
// Resource-awareness helpers for deciding "is this a good moment to spin up
// background work (a Worker, a heavy compute pass) without hurting the page
// the user is actually looking at?"
//
// There is no single "is the machine free?" browser API. What exists is a
// handful of narrow signals, each answering a different question, and it's
// on you to combine them for your actual use case. This file is a tour of
// those signals — what each one is FOR, what it can't tell you, and which
// browsers support it — not a generic "system health" library.
// ──────────────────────────────────────────────────────────────

/**
 * 1. requestIdleCallback — "run this when the main thread has spare time
 *    before the next frame." This is the ONLY signal here that's actually
 *    designed for this exact job: the browser itself tracks its own frame
 *    budget and calls you back during the gaps, no polling needed.
 *
 *    Caveat: Safari has never implemented it (as of this writing). The
 *    fallback below uses setTimeout, which fires on a schedule but has no
 *    idea whether the thread is actually free — a reasonable approximation,
 *    not an equivalent.
 */
export function onIdle(callback: () => void, options?: { timeout?: number }): () => void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, options)
    return () => window.cancelIdleCallback(id)
  }
  const timer = setTimeout(callback, options?.timeout ?? 200)
  return () => clearTimeout(timer)
}

/**
 * 2. Device capability — read ONCE at startup, not continuously. These
 *    answer "is this machine even capable of comfortable background work?",
 *    not "is it busy right now." A phone with 2 cores and 2GB RAM should
 *    probably never run a background Worker for a nice-to-have thumbnail;
 *    a 16-core desktop can absorb it without a second thought regardless of
 *    what else is happening.
 *
 *    - navigator.hardwareConcurrency: logical CPU core count. Universally
 *      supported, but the number is a ceiling, not a current-load reading —
 *      a 2-core machine could be 100% idle right now.
 *    - navigator.deviceMemory: approximate RAM in GB, bucketed
 *      (0.25/0.5/1/2/4/8) for fingerprinting resistance. Chrome/Edge only —
 *      undefined on Firefox/Safari, so this is a "bonus signal if present,"
 *      never something to require.
 */
export function getDeviceCapability(): { cores: number; approxMemoryGB: number | null; isLowEnd: boolean } {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4
  // deviceMemory isn't in the standard lib.dom.d.ts Navigator type yet.
  const approxMemoryGB = typeof navigator !== 'undefined' && 'deviceMemory' in navigator
    ? (navigator as Navigator & { deviceMemory: number }).deviceMemory
    : null

  // A deliberately conservative bar: 2 cores OR (known to be) 2GB RAM is
  // "treat this as a phone," regardless of which single number tripped it.
  const isLowEnd = cores <= 2 || (approxMemoryGB !== null && approxMemoryGB <= 2)

  return { cores, approxMemoryGB, isLowEnd }
}

/**
 * 3. Network Information API (navigator.connection) — Chrome/Edge/Android
 *    WebView only, never shipped in Firefox or Safari (both rejected it on
 *    privacy-fingerprinting grounds). It tells you the CONNECTION's
 *    characteristics (effectiveType: 'slow-2g'|'2g'|'3g'|'4g', downlink
 *    Mbps estimate, saveData: did the user turn on "Lite mode"), not
 *    anything about CPU/GPU. Genuinely relevant only when the background
 *    work involves a network request — for a pure in-browser video frame
 *    grab (our case), there's nothing to gate on here, which is exactly
 *    why the thumbnail scheduler below doesn't call this. Included so you
 *    can see the shape of it and use it elsewhere (e.g. before prefetching).
 */
export function getNetworkInfo(): { effectiveType: string; downlinkMbps: number; saveData: boolean } | null {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) return null
  const conn = (navigator as Navigator & {
    connection?: { effectiveType: string; downlink: number; saveData: boolean }
  }).connection
  if (!conn) return null
  return { effectiveType: conn.effectiveType, downlinkMbps: conn.downlink, saveData: conn.saveData }
}

/**
 * 4. GPU — there is NO browser API that reports current GPU utilization,
 *    full stop. What DOES exist is WebGPU's navigator.gpu.requestAdapter(),
 *    which tells you a GPU adapter exists and some static limits — a
 *    presence/capability check, same category as hardwareConcurrency, not
 *    a load reading. Chrome/Edge (and behind flags elsewhere); most other
 *    browsers return undefined for navigator.gpu entirely, so this must
 *    always be treated as optional. Async because requesting an adapter is
 *    itself an async browser operation.
 */
export async function hasGpuAdapter(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false
  try {
    const adapter = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

/**
 * 5. Frame-timing jank sampler — the closest thing to a live "how busy is
 *    the main thread right now" reading, and it's an inference, not a
 *    measurement: requestAnimationFrame is supposed to fire ~every 16.7ms
 *    (60fps). If the gap between two rAF calls is much longer than that,
 *    SOMETHING is hogging the thread between frames — could be your own JS,
 *    a heavy layout/paint, or yes, GPU-bound compositing work stalling the
 *    frame. It cannot tell CPU-bound from GPU-bound; it can only tell you
 *    "frames are being missed." That's the honest ceiling of what's
 *    observable from JS — there's no lower-level counter exposed to the web.
 *
 *    Call `start()` once; each sample updates a rolling average dropped-frame
 *    ratio you can read with `getJankRatio()` (0 = buttery, closer to 1 =
 *    thread is struggling). Call the returned `stop()` when you're done
 *    watching — this runs every frame, so don't leave it running forever.
 */
export function startJankSampler(sampleSize = 30) {
  let lastTime = performance.now()
  const deltas: number[] = []
  let rafId: number

  function tick(now: number) {
    const delta = now - lastTime
    lastTime = now
    deltas.push(delta)
    if (deltas.length > sampleSize) deltas.shift()
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return {
    /** 0 = every frame landed on time; 1 = every sampled frame was at least 2x the 16.7ms budget. */
    getJankRatio(): number {
      if (deltas.length === 0) return 0
      const budget = 1000 / 60
      const janky = deltas.filter((d) => d > budget * 2).length
      return janky / deltas.length
    },
    stop() {
      cancelAnimationFrame(rafId)
    },
  }
}

/**
 * The actual decision function the thumbnail worker manager calls: combines
 * the one-time capability check (don't even try on a low-end device) with
 * requestIdleCallback (don't run until the browser itself says there's a
 * gap). Network/GPU signals are deliberately NOT part of this decision —
 * see the comments above for why they don't apply to a local video frame
 * grab — but they're exported above so you can reach for them in a
 * different scenario (e.g. gating a prefetch on network, not on idle time).
 */
export function whenSafeToRunBackgroundWork(callback: () => void): () => void {
  const { isLowEnd } = getDeviceCapability()
  if (isLowEnd) {
    // Still run it — just later and with a longer timeout, so it never
    // competes with initial interaction on a phone, but a nice-to-have
    // thumbnail still eventually appears instead of never generating.
    return onIdle(callback, { timeout: 4000 })
  }
  return onIdle(callback, { timeout: 2000 })
}
