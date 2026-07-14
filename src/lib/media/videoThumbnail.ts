import { requestThumbnail } from './thumbnailWorker'

/**
 * Grabs a still frame from a video file and returns a compressed thumbnail
 * blob. Two-part pipeline, split across threads for a reason:
 *
 * 1. HERE, on the main thread: decode the video and capture one frame as an
 *    ImageBitmap. This step is unavoidably main-thread — Workers have no
 *    DOM, so there's no way to create an <video> element inside one, and
 *    createImageBitmap()'s video-decode fast path is only defined for a
 *    real HTMLVideoElement. In practice this step is fast (decoding a
 *    single frame, not the whole file) — it's not the part that would
 *    freeze the UI.
 * 2. In the Worker (thumbnailWorker.ts): resize + re-encode to a compressed
 *    blob. This is the part actually worth moving off the main thread —
 *    canvas encoding of a full-resolution frame can take real time on a
 *    slow device, and unlike step 1 there's no DOM dependency stopping it
 *    from running in a Worker via OffscreenCanvas.
 *
 * Returns null (never throws) on any failure — a missing thumbnail should
 * never block publishing the video itself.
 *
 * `onProgress` reports the four real sequential stages below as percentages
 * (10/40/70/100) — there's no byte-level progress to report within any one
 * of them (unlike a file upload), so this is honest step progress, not a
 * finer-grained fake.
 */
export async function generateVideoThumbnail(
  file: Blob,
  onProgress?: (percent: number) => void,
): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.src = url

  try {
    onProgress?.(10)
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('Video failed to load for thumbnailing')), { once: true })
    })

    // 1s in, or 10% of a very short clip — never past the end, and past the
    // often-black or still-fading-in first frame.
    onProgress?.(40)
    video.currentTime = Math.min(1, video.duration * 0.1)

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('seeked', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(new Error('Video seek failed for thumbnailing')), { once: true })
    })

    onProgress?.(70)
    const bitmap = await createImageBitmap(video)
    const blob = await requestThumbnail(bitmap)
    onProgress?.(100)
    return blob
  } catch (e) {
    console.error('[generateVideoThumbnail] Failed:', e)
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
