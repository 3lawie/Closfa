import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Sparkles, Loader2, Image as ImageIcon, Layers } from 'lucide-react'
import { clientEnv } from '@/lib/env/client-env'
import { toast } from '@/components/ui/Toast'
import { useOverlay } from '@/lib/hooks/useOverlay'

interface ImageLightboxProps {
  /** Raw ImageKit paths (not pre-built URLs) — the lightbox builds its own
   *  display/original/upscaled variants so it can request any of them on demand. */
  images: string[]
  startIndex?: number
  /** The post author's chosen default (post.media_quality) — 'original' skips
   *  straight to the untransformed file instead of the compressed AVIF. */
  initialFormat?: 'avif' | 'original'
  onClose: () => void
}

type ImageFormat = 'avif' | 'original' | 'upscaled'

const FORMAT_META: Record<ImageFormat, { label: string; icon: typeof ImageIcon }> = {
  avif: { label: 'AVIF', icon: ImageIcon },
  original: { label: 'Original', icon: Layers },
  upscaled: { label: 'Upscaled', icon: Sparkles },
}

const IK = clientEnv.imagekitUrlEndpoint

// The feed always requests a small AVIF (bandwidth-friendly, see PostCard's
// MediaGrid) — this is the one place worth paying for the full original or
// an upscale, so both are opt-in here rather than the lightbox's default.
function displaySrc(path: string) {
  return `${IK}/tr:w-1600,c-at_max,f-avif/${path}`
}
// e-upscale is ImageKit's AI upscaling transform — a paid add-on that isn't
// enabled on every account/plan, so it's tried and falls back to the plain
// original if it 404s (see selectFormat's catch below).
function upscaledSrc(path: string) {
  return `${IK}/tr:e-upscale,f-avif/${path}`
}
function originalSrc(path: string) {
  return `${IK}/${path}`
}
function formatSrc(path: string, format: ImageFormat) {
  if (format === 'original') return originalSrc(path)
  if (format === 'upscaled') return upscaledSrc(path)
  return displaySrc(path)
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('failed to load'))
    img.src = src
  })
}

// Fullscreen image viewer. The outer frame keeps generous padding on every
// side (see the p-* classes below) so the image never touches the viewport
// edge — "breathing room" per Refactoring UI, not an edge-to-edge crop.
export function ImageLightbox({ images, startIndex = 0, initialFormat = 'avif', onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(startIndex)
  const defaultFormat: ImageFormat = initialFormat === 'original' ? 'original' : 'avif'
  const [format, setFormat] = useState<ImageFormat>(defaultFormat)
  const [visibleSrc, setVisibleSrc] = useState(() => formatSrc(images[startIndex], defaultFormat))
  // Which of the three options is currently being fetched — drives the
  // spinner on that specific button, not a generic full-screen loading state.
  const [loadingFormat, setLoadingFormat] = useState<ImageFormat | null>(null)

  // Switching images always resets to the post's chosen default — format
  // choices are per-image, opt-in requests, not something that should carry
  // over from one image in the slider to the next.
  //
  // Adjusted during render rather than in an effect. React explicitly supports
  // this for "reset state when a value changes": it re-renders this component
  // immediately, before committing anything to the DOM, so there's no visible
  // frame showing the previous image's format. The effect version painted the
  // stale state first and then corrected it.
  const [lastIndex, setLastIndex] = useState(index)
  if (index !== lastIndex) {
    setLastIndex(index)
    setFormat(defaultFormat)
    setVisibleSrc(formatSrc(images[index], defaultFormat))
    setLoadingFormat(null)
  }

  // The preview is a real "place" as far as the user is concerned, so the
  // phone's Back button should return them to the post rather than leave the
  // page. That, Escape, and the scroll lock are all the overlay stack's job —
  // this component used to clear body.overflow unconditionally on unmount,
  // which unlocked scrolling behind the post modal it was opened from.
  const { isTopmost } = useOverlay({ isOpen: true, onClose })

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // PostCard binds the same arrows on `document` to seek its media grid.
      // Without this the underlying post scrubs along with the lightbox.
      if (!isTopmost()) return
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, images.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [images.length, isTopmost])

  if (typeof document === 'undefined') return null

  const currentPath = images[index]

  // The visible <img> never changes src until the requested format has
  // fully loaded in the background — no blank/flash gap while it fetches,
  // the current image just stays put with a spinner on the button pressed.
  async function selectFormat(target: ImageFormat) {
    if (target === format || loadingFormat) return
    setLoadingFormat(target)
    try {
      await preloadImage(formatSrc(currentPath, target))
      setVisibleSrc(formatSrc(currentPath, target))
      setFormat(target)
    } catch {
      if (target === 'upscaled') {
        // Upscaling isn't enabled on every plan — fall back to the original
        // bytes rather than leaving the button stuck in a failed state.
        try {
          await preloadImage(originalSrc(currentPath))
          setVisibleSrc(originalSrc(currentPath))
          setFormat('original')
          toast('Upscaling is unavailable — showing the original instead.', { variant: 'default' })
        } catch {
          // Both failed — stay on whatever's currently showing.
        }
      }
    }
    setLoadingFormat(null)
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 sm:p-10 md:p-16"
        onClick={onClose}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {images.length > 1 && (
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-medium">
            {index + 1} / {images.length}
          </div>
        )}

        {/* Three explicit, mutually-exclusive options — not a toggle plus a
            bonus action — so it's always clear which variant is showing and
            there's exactly one place to pick any of the three. */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 sm:bottom-6 flex items-center gap-1 p-1 rounded-full bg-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {(Object.keys(FORMAT_META) as ImageFormat[]).map((opt) => {
            const { label, icon: Icon } = FORMAT_META[opt]
            const isActive = format === opt
            const isLoading = loadingFormat === opt
            return (
              <button
                key={opt}
                onClick={() => selectFormat(opt)}
                disabled={loadingFormat !== null}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] disabled:cursor-default ${
                  isActive ? 'bg-white text-black' : 'text-white hover:bg-white/20'
                }`}
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                {label}
              </button>
            )
          })}
        </div>

        {images.length > 1 && index > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => i - 1) }}
            className="absolute left-2 sm:left-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            aria-label="Previous image"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {images.length > 1 && index < images.length - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setIndex((i) => i + 1) }}
            className="absolute right-2 sm:right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            aria-label="Next image"
          >
            <ChevronRight size={22} />
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.img
            key={index}
            src={visibleSrc}
            alt=""
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="max-w-full max-h-full w-auto h-auto object-contain rounded-md select-none"
            onClick={(e) => e.stopPropagation()}
          />
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
