import { whenSafeToRunBackgroundWork } from './idleScheduler'
// Type-only import can use the alias — only the `new URL(...)` call below
// needs a literal relative path, since Vite's worker-detection is a
// syntactic match on that call and doesn't resolve tsconfig path aliases.
import type { ThumbnailRequest, ThumbnailResponse } from '@/workers/thumbnail.worker'

// Lazy singleton — the whole point of gating this behind
// whenSafeToRunBackgroundWork is that creating a Worker has a real (if
// small) cost: spinning up a separate JS realm, parsing/compiling the
// worker script. Doing that eagerly on every page load pays that cost even
// for users who never touch a video. Instead: nothing happens until the
// first actual thumbnail request, and even then it waits for an idle
// window before the Worker is constructed.
let worker: Worker | null = null
let workerReadyPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (worker) return Promise.resolve(worker)
  if (workerReadyPromise) return workerReadyPromise

  workerReadyPromise = new Promise((resolve) => {
    whenSafeToRunBackgroundWork(() => {
      // The `new URL(..., import.meta.url)` form is Vite's documented worker
      // pattern — it lets Vite statically find and bundle the worker script
      // as its own chunk, separate from the main app bundle. Must be a
      // literal relative path (not the `@/` alias) — Vite's worker detection
      // is a syntactic match on this exact call shape, done before the
      // tsconfig-paths plugin resolves aliases.
      worker = new Worker(new URL('../../workers/thumbnail.worker.ts', import.meta.url), { type: 'module' })
      resolve(worker)
    })
  })
  return workerReadyPromise
}

let requestCounter = 0
const pending = new Map<string, { resolve: (blob: Blob) => void; reject: (err: Error) => void }>()

/**
 * Resize + re-encode an already-captured video frame in the background
 * Worker. Returns null (never throws) if this browser lacks Worker/
 * OffscreenCanvas/ImageBitmap support — thumbnail generation is a nice-to-
 * have, not something worth breaking the publish flow over.
 */
export async function requestThumbnail(bitmap: ImageBitmap, maxWidth = 480, maxHeight = 480): Promise<Blob | null> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    bitmap.close()
    return null
  }

  const id = `thumb_${++requestCounter}`

  try {
    const w = await getWorker()
    // First message to a freshly-created worker attaches the listener here
    // (not in getWorker) so every caller's promise resolves independently —
    // one shared worker, many concurrent requests, correlated by `id`.
    if (!w.onmessage) {
      w.onmessage = (e: MessageEvent<ThumbnailResponse>) => {
        const entry = pending.get(e.data.id)
        if (!entry) return
        pending.delete(e.data.id)
        if (e.data.ok) entry.resolve(e.data.blob)
        else entry.reject(new Error(e.data.error))
      }
    }

    return await new Promise<Blob>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      const request: ThumbnailRequest = { id, bitmap, maxWidth, maxHeight }
      // bitmap is a transferable — listed in the second argument so
      // postMessage moves it instead of structured-cloning (copying) it.
      w.postMessage(request, [bitmap])
    })
  } catch (e) {
    console.error('[requestThumbnail] Failed:', e)
    return null
  }
}
