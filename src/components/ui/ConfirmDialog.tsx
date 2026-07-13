import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  isPending?: boolean
}

// App-styled replacement for window.confirm() — same portal/escape-key/
// backdrop-lock conventions as Modal.tsx, just a smaller, single-purpose
// dialog for "are you sure" prompts (deletions, etc).
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel = 'Delete', isPending }: ConfirmDialogProps) {
  // Every post card mounts one of these unconditionally (isOpen just toggles
  // visibility) — `typeof document === 'undefined'` mismatches between server
  // and the client's first render pass the same way Toast.tsx's Toaster did;
  // see that fix for the full explanation. `mounted` avoids it.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    if (isOpen) document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
          />
          <motion.div
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            className="relative w-full max-w-sm bg-surface rounded-lg shadow-md border border-border p-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-text-h mb-2">{title}</h2>
            <p className="text-sm text-text-s leading-relaxed mb-6">{description}</p>
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button variant="destructive" onClick={onConfirm} isPending={isPending}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
