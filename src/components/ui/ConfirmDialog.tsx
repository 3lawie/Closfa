import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useOverlay } from '@/lib/hooks/useOverlay'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useIsMounted } from '@/lib/hooks/useIsMounted'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  isPending?: boolean
  /** @default true — the phone's Back button dismisses the prompt. */
  backToClose?: boolean
}

// App-styled replacement for window.confirm() — same portal/escape-key/
// backdrop-lock conventions as Modal.tsx, just a smaller, single-purpose
// dialog for "are you sure" prompts (deletions, etc).
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel = 'Delete', isPending, backToClose = true }: ConfirmDialogProps) {
  // Every post card mounts one of these unconditionally (isOpen just toggles
  // visibility) — `typeof document === 'undefined'` mismatches between server
  // and the client's first render pass the same way Toast.tsx's Toaster did;
  // see that fix for the full explanation. `mounted` avoids it.
  const mounted = useIsMounted()

  // Escape / Back / scroll-lock now come from the shared overlay stack, which
  // is what makes a confirm dialog opened *on top of* a modal close only
  // itself instead of taking the modal down with it.
  useOverlay({ isOpen, onClose, backToClose })

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, { active: isOpen && mounted })
  // useId, not a hardcoded string: two of these can be mounted at once (a post
  // card and a comment beneath it), and duplicate ids break aria-labelledby.
  const titleId = useId()

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
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
            tabIndex={-1}
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            className="relative w-full max-w-sm bg-surface rounded-lg shadow-md border border-border p-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 id={titleId} className="text-lg font-bold text-text-h mb-2">{title}</h2>
            <p className="text-sm text-text-s leading-relaxed mb-6">{description}</p>
            <div className="flex items-center justify-end gap-3">
              {/* Cancel takes initial focus, never the destructive action — a
                  stray Enter should not delete anything. */}
              <Button variant="ghost" data-autofocus onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button variant="destructive" onClick={onConfirm} isPending={isPending}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
