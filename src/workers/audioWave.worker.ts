// Runs off the main thread. Draws one or more audio-reactive wave canvases
// via OffscreenCanvas, so the actual path math + fill (the expensive part at
// 60fps) never competes with the feed's scroll/layout work on the main
// thread. The main thread's only job per frame is reading the real
// AnalyserNode data (a Worker can't touch Web Audio nodes) and posting the
// small resulting snapshot in here — see src/lib/media/audioWaveWorker.ts.

import { drawWave, bandLevel } from '@/lib/media/audioWaveDraw'

export type AudioWaveMessage =
  | { type: 'attach'; id: string; canvas: OffscreenCanvas; width: number; height: number; accentColor: string }
  | { type: 'resize'; id: string; width: number; height: number }
  | { type: 'levels'; id: string; data: Uint8Array; playing: boolean }
  | { type: 'detach'; id: string }

type Instance = {
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
  width: number
  height: number
  accentColor: string
  playing: boolean
  targetLevel: number
  smoothedLevel: number
  // Eased toward 1 while playing, 0 while paused — drives the crossfade
  // between the two animations in drawWave rather than a hard cut.
  transition: number
  // Accumulated clock, NOT elapsed wall-clock seconds — advances each frame
  // by dt * speed(smoothedLevel), so drawWave's animation phase only ever
  // continues smoothly even as the level (and therefore speed) fluctuates
  // constantly during real playback. See drawWave's doc comment.
  clock: number
}

const instances = new Map<string, Instance>()
let rafId: number | null = null
let lastFrameTime: number | null = null

// requestAnimationFrame is only exposed on dedicated WorkerGlobalScope when
// an OffscreenCanvas is in play, and even then not in every browser — a
// setTimeout-based loop is the honest fallback, same reasoning as the
// jank sampler in idleScheduler.ts.
const raf: (cb: (t: number) => void) => number =
  typeof self.requestAnimationFrame === 'function'
    ? self.requestAnimationFrame.bind(self)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number
const cancelRaf: (id: number) => void =
  typeof self.cancelAnimationFrame === 'function'
    ? self.cancelAnimationFrame.bind(self)
    : (id) => clearTimeout(id)

function loop(now: number) {
  const dt = Math.min(0.05, (now - (lastFrameTime ?? now)) / 1000)
  lastFrameTime = now

  for (const inst of instances.values()) {
    inst.smoothedLevel += (inst.targetLevel - inst.smoothedLevel) * Math.min(1, 0.18 * (dt * 60))
    inst.transition += ((inst.playing ? 1 : 0) - inst.transition) * Math.min(1, 3.5 * dt)
    const speed = inst.playing ? 0.06 + inst.smoothedLevel * 0.15 : 0.05
    inst.clock += dt * speed
    drawWave(inst.ctx, inst.width, inst.height, inst.clock, inst.smoothedLevel, inst.transition, inst.accentColor)
  }

  rafId = instances.size > 0 ? raf(loop) : null
}

function ensureLoopRunning() {
  if (rafId === null) {
    lastFrameTime = null
    rafId = raf(loop)
  }
}

self.onmessage = (e: MessageEvent<AudioWaveMessage>) => {
  const msg = e.data
  switch (msg.type) {
    case 'attach': {
      // OffscreenCanvas keeps its default 300x150 backing buffer until
      // explicitly resized — the width/height carried in the message are
      // the real device-pixel size the main thread measured from the DOM.
      msg.canvas.width = msg.width
      msg.canvas.height = msg.height
      const ctx = msg.canvas.getContext('2d')
      if (!ctx) return
      instances.set(msg.id, {
        canvas: msg.canvas,
        ctx,
        width: msg.width,
        height: msg.height,
        accentColor: msg.accentColor,
        playing: false,
        targetLevel: 0,
        smoothedLevel: 0,
        transition: 0,
        clock: 0,
      })
      ensureLoopRunning()
      break
    }
    case 'resize': {
      const inst = instances.get(msg.id)
      if (!inst) return
      inst.canvas.width = msg.width
      inst.canvas.height = msg.height
      inst.width = msg.width
      inst.height = msg.height
      break
    }
    case 'levels': {
      const inst = instances.get(msg.id)
      if (!inst) return
      inst.targetLevel = bandLevel(msg.data)
      inst.playing = msg.playing
      break
    }
    case 'detach': {
      instances.delete(msg.id)
      if (instances.size === 0 && rafId !== null) {
        cancelRaf(rafId)
        rafId = null
      }
      break
    }
  }
}
