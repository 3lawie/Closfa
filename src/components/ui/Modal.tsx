import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils/cn'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
}

export function Modal({ isOpen, onClose, children, className, title }: ModalProps) {
  // Same SSR/hydration-mismatch fix as Toast.tsx's Toaster and
  // ConfirmDialog — any caller that mounts this unconditionally (isOpen just
  // toggling visibility) hit a guaranteed server/client first-render mismatch
  // with the old `typeof document === 'undefined'` check.
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
    const handleCancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleCancel)
    }
    return () => document.removeEventListener('keydown', handleCancel)
  }, [isOpen, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            // Fixed dark scrim, deliberately NOT the swappable bg token — a
            // backdrop must stay dark regardless of light/dark mode or theme.
            className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer"
          />
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
            className={cn(
              "relative w-full max-w-2xl bg-surface rounded-lg shadow-md border border-border overflow-hidden flex flex-col max-h-[90vh]",
              className
            )}
          >
            <header className="flex items-center justify-between p-4 px-6 border-b border-border bg-surface-translucent backdrop-blur-md sticky top-0 z-10 shrink-0">
              {title ? (
                <h2 className="text-lg font-bold text-text-h">{title}</h2>
              ) : <div/>}
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-border text-text-s hover:text-text transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                aria-label="Close dialog">
                <X size={20} strokeWidth={2.5} />
              </button>
            </header>
            <div className="overflow-y-auto p-6 flex-1 custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
