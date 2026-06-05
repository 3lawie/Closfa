import { useQuery } from '@tanstack/react-query'
import { useRef, useState, useEffect } from 'react'
import { clientEnv } from '@/lib/env/client-env'

// ──────────────────────────────────────────────────────────────
// ImageRenderer — two-phase lazy loading via IntersectionObserver
//
// Why two phases?
//   Phase 1 — HEAD request (metadata only): runs immediately on mount.
//     ~0 bytes of image data downloaded. Validates the image exists,
//     grabs content-type and content-length from headers.
//   Phase 2 — dimension check: deferred until the element scrolls
//     into the viewport. Loads the original (untransformed) image
//     into a temporary Image() object to read naturalWidth/naturalHeight.
//     This image is NOT rendered — it's only used for metadata.
//
// Why not just use <img loading="lazy">?
//   Browser-native lazy loading defers the download but still reserves
//   layout space based on explicit width/height attrs. Two-phase lets
//   us discover the true aspect ratio from the server BEFORE rendering,
//   which prevents layout shift.
// ──────────────────────────────────────────────────────────────

const IMAGEKIT_URL = clientEnv.imagekitUrlEndpoint

// ──────────────────────────────────────────────────────────────
// Phase 1: Lightweight HEAD check — no image bytes downloaded
// ──────────────────────────────────────────────────────────────
async function fetchImageMeta(imagePath: string) {
  const displayUrl = `${IMAGEKIT_URL}/tr:w-500,h-500,f-avif/${imagePath}`
  const originalUrl = `${IMAGEKIT_URL}/${imagePath}`

  const response = await fetch(displayUrl, { method: 'HEAD' })
  if (!response.ok) throw new Error(`Image not found: ${response.status}`)

  return {
    displayUrl,    // optimized 500×500 AVIF for rendering
    originalUrl,   // no transforms — used for dimension reading
    contentType: response.headers.get('content-type'),
    size: response.headers.get('content-length'),
  }
}

// ──────────────────────────────────────────────────────────────
// Phase 2: Load original image to read true dimensions
// Only fires when element is visible in viewport
// ──────────────────────────────────────────────────────────────
function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load image for dimensions'))
    img.src = url
  })
}

// ──────────────────────────────────────────────────────────────
// Custom hook: fires once when element enters viewport
// ──────────────────────────────────────────────────────────────
function useIsVisible() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect() // trigger once only
        }
      },
      { threshold: 0.1 } // 10% visible is enough to start loading
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────
interface ImageRendererProps {
  imageSource?: string
  alt?: string
  width?: number
  height?: number
}

export default function ImageRenderer({
  imageSource = 'Screenshot_2026-04-26_181950_JIU0Hef83.png',
  alt = 'Image',
  width = 500,
  height = 500,
}: ImageRendererProps) {
  const { ref, isVisible } = useIsVisible()

  // Phase 1: HEAD request — runs immediately, no image bytes
  const meta = useQuery({
    queryKey: ['image-meta', imageSource],
    queryFn: () => fetchImageMeta(imageSource),
    staleTime: 1000 * 60 * 30,
  })

  // Phase 2: Dimension read — only when visible + phase 1 done
  const dimensions = useQuery({
    queryKey: ['image-dimensions', imageSource],
    queryFn: () => getImageDimensions(meta.data!.originalUrl),
    enabled: isVisible && !!meta.data,
    staleTime: 1000 * 60 * 30,
  })

  if (meta.isLoading) {
    return (
      <div
        ref={ref}
        className="rounded-xl bg-gray-200 animate-pulse flex items-center justify-center"
        style={{ width, height }}
      >
        <span className="text-gray-400 text-sm">Loading…</span>
      </div>
    )
  }

  if (meta.isError) {
    return (
      <div
        className="rounded-xl bg-red-50 border border-red-200 flex items-center justify-center"
        style={{ width, height }}
      >
        <span className="text-red-400 text-sm">Failed to load image</span>
      </div>
    )
  }

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <img
        src={meta.data!.displayUrl}
        alt={alt}
        loading="lazy"
        className="rounded-xl object-cover"
        width={width}
        height={height}
      />
      {dimensions.data && (
        <p className="text-xs text-gray-400">
          {dimensions.data.width}×{dimensions.data.height} px
          {' · '}
          {meta.data!.contentType}
          {' · '}
          {Math.round(Number(meta.data!.size) / 1024)} KB
        </p>
      )}
    </div>
  )
}
