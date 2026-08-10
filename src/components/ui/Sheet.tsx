import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useOverlay } from '@/lib/hooks/useOverlay'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useIsMounted } from '@/lib/hooks/useIsMounted'

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  /** Required — this is the dialog's accessible name, not decoration. */
  title: string
  children: React.ReactNode
  className?: string
  /** @default true */
  backToClose?: boolean
}

/**
 * A bottom sheet on small screens, a centred dialog from `sm` up.
 *
 * A sibling of Modal rather than a `variant` on it: Modal is permanently a
 * centred `max-w-2xl` with a sticky header and a `scale` spring, and threading
 * a grabber, safe-area padding and a `y` transition through `className` would
 * be prop abuse. The parts that actually matter — the overlay stack and the
 * focus trap — are shared hooks, so nothing real is duplicated.
 *
 * The responsive switch is pure CSS. `useIsMobile` would report false during
 * SSR and on the first client render, so the layout would visibly snap from
 * dialog to sheet after hydration — on exactly the devices that get the sheet.
 *
 * z-[65] sits above the lightbox (60), because sharing can be triggered from
 * inside PostModal, and below ConfirmDialog (70).
 */
export function Sheet({ isOpen, onClose, title, children, className, backToClose = true }: SheetProps) {
  const mounted = useIsMounted()

  useOverlay({ isOpen, onClose, backToClose })

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, { active: isOpen && mounted })
  const titleId = useId()
  const reduceMotion = useReducedMotion()

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            className={cn(
              'relative w-full sm:max-w-md bg-surface border border-border shadow-md',
              'rounded-t-lg sm:rounded-lg max-h-[85vh] overflow-y-auto custom-scrollbar',
              // env(safe-area-inset-bottom) keeps the last row clear of the iOS
              // home indicator; max() means it costs nothing on other devices.
              'p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6',
              className,
            )}
          >
            {/* Affordance only — the sheet isn't drag-dismissible, so it's
                hidden from assistive tech rather than announced as a control. */}
            <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-pill bg-border-strong sm:hidden" />

            <header className="flex items-start justify-between gap-4 mb-5">
              <h2 id={titleId} className="text-lg font-bold text-text-h">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 w-9 h-9 -mt-1 -mr-1 flex items-center justify-center rounded-full text-text-s hover:text-text hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </header>

            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
