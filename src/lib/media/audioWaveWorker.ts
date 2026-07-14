// Type-only import can use the alias — only the `new URL(...)` call below
// needs a literal relative path, since Vite's worker-detection is a
// syntactic match on that call and doesn't resolve tsconfig path aliases.
import type { AudioWaveMessage } from '@/workers/audioWave.worker'

// Lazy singleton, same rationale as thumbnailWorker.ts: one shared Worker
// draws every attached wave canvas (keyed by id) rather than spinning up a
// Worker per audio post — created on first attach, which only happens once
// a post's audio actually starts playing.
let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../../workers/audioWave.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

let idCounter = 0

export type AudioWaveHandle = {
  pushLevels(data: Uint8Array, playing: boolean): void
  resize(width: number, height: number): void
  destroy(): void
}

/**
 * Hands the canvas's rendering surface off to the shared wave Worker.
 * Returns null (never throws) when this browser lacks Worker/OffscreenCanvas
 * support — the wave is a nice-to-have visual, not something worth breaking
 * audio playback over; callers should fall back to drawing directly on the
 * main thread with the same `drawWave` from audioWaveDraw.ts.
 *
 * `canvas.transferControlToOffscreen()` can only be called once per canvas
 * element for its whole lifetime — callers must call this at most once per
 * mounted <canvas>, not on every play/pause toggle.
 */
export function attachAudioWave(canvas: HTMLCanvasElement, accentColor: string): AudioWaveHandle | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || !canvas.transferControlToOffscreen) {
    return null
  }

  const id = `wave_${++idCounter}`
  const dpr = window.devicePixelRatio || 1
  const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(cssWidth * dpr))
  const height = Math.max(1, Math.round(cssHeight * dpr))

  const w = getWorker()
  const offscreen = canvas.transferControlToOffscreen()
  const attach: AudioWaveMessage = { type: 'attach', id, canvas: offscreen, width, height, accentColor }
  w.postMessage(attach, [offscreen])

  return {
    pushLevels(data: Uint8Array, playing: boolean) {
      // Uint8Array snapshots from AnalyserNode.getByteFrequencyData are tiny
      // (fftSize/2 bytes) — structured-cloning is cheaper here than the
      // reallocation churn of transferring and rebuilding a fresh array
      // every animation frame. Sent every frame regardless of `playing` so
      // the Worker always has a fresh heartbeat to switch its animation mode
      // on, rather than inferring pause from silence going stale.
      const levels: AudioWaveMessage = { type: 'levels', id, data, playing }
      w.postMessage(levels)
    },
    resize(width: number, height: number) {
      const resize: AudioWaveMessage = { type: 'resize', id, width, height }
      w.postMessage(resize)
    },
    destroy() {
      const detach: AudioWaveMessage = { type: 'detach', id }
      w.postMessage(detach)
    },
  }
}
