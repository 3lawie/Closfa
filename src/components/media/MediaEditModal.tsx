import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { editFilterString } from '@/lib/utils/imageEdit'
import type { MediaEditParams } from '@/lib/utils/mediaDB'

type Crop = MediaEditParams['crop']

const FULL_CROP: Crop = { x: 0, y: 0, width: 100, height: 100 }
const MIN_CROP_PCT = 10

interface MediaEditModalProps {
  isOpen: boolean
  onClose: () => void
  imageSrc: string
  initialEdit?: MediaEditParams
  onSave: (params: MediaEditParams) => void
}

// Crop + basic color adjustment for a single staged image — non-destructive:
// this only ever produces a params object (percentages + filter values). The
// original blob in IndexedDB is never touched here; MediaContatiner just
// stores these params alongside it, and they're baked into a real image
// once, at publish time (src/lib/utils/imageEdit.ts), so reopening the
// editor always resumes from the last-saved crop/adjustments instead of
// destructively re-editing an already-cropped image.
export function MediaEditModal({ isOpen, onClose, imageSrc, initialEdit, onSave }: MediaEditModalProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [crop, setCrop] = useState<Crop>(initialEdit?.crop ?? FULL_CROP)
  const [brightness, setBrightness] = useState(initialEdit?.brightness ?? 0)
  const [contrast, setContrast] = useState(initialEdit?.contrast ?? 0)
  const [saturation, setSaturation] = useState(initialEdit?.saturation ?? 0)
  const dragState = useRef<{ mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; startCrop: Crop } | null>(null)

  const filterString = editFilterString({ brightness, contrast, saturation })

  function clampCrop(next: Crop): Crop {
    const width = Math.min(100, Math.max(MIN_CROP_PCT, next.width))
    const height = Math.min(100, Math.max(MIN_CROP_PCT, next.height))
    const x = Math.min(100 - width, Math.max(0, next.x))
    const y = Math.min(100 - height, Math.max(0, next.y))
    return { x, y, width, height }
  }

  function handlePointerDown(mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, startCrop: crop }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current
    const stage = stageRef.current
    if (!drag || !stage) return
    const rect = stage.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100
    const s = drag.startCrop

    if (drag.mode === 'move') {
      setCrop(clampCrop({ ...s, x: s.x + dxPct, y: s.y + dyPct }))
      return
    }

    let next = { ...s }
    if (drag.mode === 'nw') next = { x: s.x + dxPct, y: s.y + dyPct, width: s.width - dxPct, height: s.height - dyPct }
    if (drag.mode === 'ne') next = { x: s.x, y: s.y + dyPct, width: s.width + dxPct, height: s.height - dyPct }
    if (drag.mode === 'sw') next = { x: s.x + dxPct, y: s.y, width: s.width - dxPct, height: s.height + dyPct }
    if (drag.mode === 'se') next = { x: s.x, y: s.y, width: s.width + dxPct, height: s.height + dyPct }
    setCrop(clampCrop(next))
  }

  function handlePointerUp() {
    dragState.current = null
  }

  function handleSave() {
    onSave({ crop, brightness, contrast, saturation })
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className="relative w-full max-w-3xl bg-surface rounded-lg shadow-md border border-border overflow-hidden flex flex-col max-h-[92vh]"
          >
            <header className="flex items-center justify-between p-4 px-6 border-b border-border shrink-0">
              <h2 className="text-lg font-bold text-text-h">Edit media</h2>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-translucent text-text-s hover:text-text transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6">
              {/* Stage — image + draggable crop box */}
              <div
                ref={stageRef}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="relative mx-auto max-h-[45vh] w-fit select-none touch-none overflow-hidden rounded-md"
              >
                <img
                  src={imageSrc}
                  alt=""
                  className="block max-h-[45vh] max-w-full object-contain"
                  style={{ filter: filterString }}
                  draggable={false}
                />

                {/* Crop box — its own box-shadow (spread 9999px, clipped by the
                    stage's overflow-hidden) is the ONLY dimming mechanism, so
                    there's no separate overlay to fight with the border for
                    visibility. Border sits on the crop edge itself (inside
                    the kept area), in the theme accent color for contrast
                    against both the image and the dark dimmed surround. */}
                <div
                  onPointerDown={(e) => handlePointerDown('move', e)}
                  className="absolute border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] cursor-move"
                  style={{
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.width}%`,
                    height: `${crop.height}%`,
                  }}
                >
                  {/* Visible dot is small, but its touch target is a full
                      44px hit zone (centered on the same corner) — a 16px
                      target is fine with a mouse but too small to reliably
                      grab on a phone. */}
                  {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                    <div
                      key={corner}
                      onPointerDown={(e) => handlePointerDown(corner, e)}
                      className={`absolute w-11 h-11 flex items-center justify-center ${
                        corner === 'nw' ? '-top-5.5 -left-5.5 cursor-nwse-resize' :
                        corner === 'ne' ? '-top-5.5 -right-5.5 cursor-nesw-resize' :
                        corner === 'sw' ? '-bottom-5.5 -left-5.5 cursor-nesw-resize' :
                        '-bottom-5.5 -right-5.5 cursor-nwse-resize'
                      }`}
                    >
                      <div className="w-4 h-4 bg-accent border-2 border-white rounded-full shadow-sm pointer-events-none" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Crop presets */}
              <div className="flex items-center gap-2 justify-center flex-wrap">
                {([
                  ['Free', FULL_CROP],
                  ['1:1', { x: 10, y: 10, width: 80, height: 80 }],
                  ['4:5', { x: 15, y: 5, width: 70, height: 90 }],
                  ['16:9', { x: 5, y: 25, width: 90, height: 50 }],
                ] as const).map(([label, preset]) => (
                  <button
                    key={label}
                    onClick={() => setCrop(preset)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-surface-translucent text-text-s hover:bg-accent-bg hover:text-accent border border-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Adjustments */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-text">Adjustments</h3>
                  <button
                    onClick={() => { setBrightness(0); setContrast(0); setSaturation(0) }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-text-s hover:text-text transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                  >
                    <RotateCcw size={12} /> Reset
                  </button>
                </div>
                {[
                  ['Brightness', brightness, setBrightness],
                  ['Contrast', contrast, setContrast],
                  ['Saturation', saturation, setSaturation],
                ].map(([label, value, setter]) => (
                  <label key={label as string} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-text-s">
                      <span>{label as string}</span>
                      <span>{value as number}</span>
                    </div>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={value as number}
                      onChange={(e) => (setter as (n: number) => void)(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 px-6 border-t border-border shrink-0">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
