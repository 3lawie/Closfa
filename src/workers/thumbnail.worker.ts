// Runs off the main thread. No DOM here — a Worker can't create a <video>
// or <canvas> element, which is why the video frame itself is grabbed on
// the main thread (see src/lib/media/videoThumbnail.ts) and handed in as an
// ImageBitmap: ImageBitmap is a "transferable" — postMessage moves its
// underlying pixel buffer instead of copying it, so handing a already-large
// video frame across the thread boundary is effectively free.
//
// What actually runs HERE, off the main thread, is the expensive part:
// resizing down to thumbnail dimensions and re-encoding to a compressed
// blob. OffscreenCanvas exists specifically so canvas drawing/encoding
// isn't tied to a real <canvas> element in the DOM.

export type ThumbnailRequest = {
  id: string
  bitmap: ImageBitmap
  maxWidth: number
  maxHeight: number
}

export type ThumbnailResponse =
  | { id: string; ok: true; blob: Blob }
  | { id: string; ok: false; error: string }

self.onmessage = async (e: MessageEvent<ThumbnailRequest>) => {
  const { id, bitmap, maxWidth, maxHeight } = e.data

  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close() // release the transferred pixel buffer promptly

    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })

    const response: ThumbnailResponse = { id, ok: true, blob }
    self.postMessage(response)
  } catch (err) {
    const response: ThumbnailResponse = { id, ok: false, error: err instanceof Error ? err.message : 'Unknown worker error' }
    self.postMessage(response)
  }
}
