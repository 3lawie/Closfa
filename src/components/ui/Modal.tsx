import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils/cn'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
}

export function Modal({ isOpen, onClose, children, className, title }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      dialog.showModal()
      // Lock body scroll
      document.body.style.overflow = 'hidden'
    } else if (!isOpen && dialog.open) {
      dialog.close()
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Handle click outside to close
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleBackdropClick = (e: MouseEvent) => {
      const rect = dialog.getBoundingClientRect()
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      )
      if (!isInDialog) {
        onClose()
      }
    }

    dialog.addEventListener('click', handleBackdropClick)
    return () => dialog.removeEventListener('click', handleBackdropClick)
  }, [onClose])

  // Handle escape key
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        'open:animate-in open:fade-in-0 open:zoom-in-95',
        'p-0 m-auto rounded-2xl shadow-2xl border-0',
        'max-w-2xl w-full max-h-[90vh] overflow-hidden',
        className
      )}
      style={{
        background: 'var(--bg)',
        color: 'var(--text)'
      }}
    >
      <div className="flex flex-col h-full max-h-[90vh]">
        {(title || onClose) && (
          <header className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
            {title ? (
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-h)' }}>{title}</h2>
            ) : <div />}
            <button 
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close dialog"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </header>
        )}
        <div className="overflow-y-auto overscroll-contain flex-1">
          {children}
        </div>
      </div>
    </dialog>
  )
}
