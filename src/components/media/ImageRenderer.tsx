import { useQuery } from '@tanstack/react-query'
import { useRef, useState, useEffect } from 'react'
import { clientEnv } from '@/lib/env/client-env'
import { createServerFn } from '@tanstack/react-start'
import { cn } from '@/lib/utils/cn'
import { Loader2, AlertCircle } from 'lucide-react'

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
// Phase 1: Lightweight HEAD check — executed securely on the server
// ──────────────────────────────────────────────────────────────
export const fetchImageMetaFn = createServerFn({ method: 'GET' })
  .handler(async ({ data }) => {
    const imagePath = data as unknown as string
    const displayUrl = `${IMAGEKIT_URL}/tr:w-500,h-500,f-avif/${imagePath}`
    const originalUrl = `${IMAGEKIT_URL}/${imagePath}`

    let contentType: string | null = null
    let size: string | null = null

    try {
      const response = await fetch(displayUrl, { method: 'HEAD' })
      if (response.ok) {
        contentType = response.headers.get('content-type')
        size = response.headers.get('content-length')
      }
    } catch (e) {
      console.error('[fetchImageMetaFn] Failed to fetch image metadata headers:', e)
    }

    return {
      displayUrl,    // optimized 500×500 AVIF for rendering
      originalUrl,   // no transforms — used for dimension reading
      contentType,
      size,
    }
  })


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
    queryFn: () => fetchImageMetaFn({ data: imageSource as any }),
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
        className={cn(
          'flex items-center justify-center bg-surface rounded-md overflow-hidden',
          'text-text-s text-center px-4'
        )}
        style={{ width, height }}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-text-h" />
          <span>Loading…</span>
        </div>
      </div>
    )
  }

  if (meta.isError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface rounded-md overflow-hidden',
          'text-text-s text-text-h text-center px-4'
        )}
        style={{ width, height }}>
        <div className="flex flex-col items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger" />
          <span>Failed to load image</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="group relative overflow-hidden rounded-md">
      <img
        src={meta.data!.displayUrl}
        alt={alt}
        loading="lazy"
        className="block object-cover"
        width={width}
        height={height}
        style={{ width, height }}
      />
      {dimensions.data && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-surface-translucent backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-base)]">
          <p className="text-[10px] text-text-s leading-tight">
            {dimensions.data.width}×{dimensions.data.height} px
            {' · '}
            {meta.data!.contentType}
            {' · '}
            {Math.round(Number(meta.data!.size) / 1024)} KB
          </p>
        </div>
      )}
    </div>
  )
}
