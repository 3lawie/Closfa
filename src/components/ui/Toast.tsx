import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type ToastVariant = 'default' | 'success' | 'danger'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
  action?: ToastAction
  duration: number
}

interface ToastOptions {
  variant?: ToastVariant
  action?: ToastAction
  /** ms before auto-dismiss; 0 disables auto-dismiss. Default 4000, 6000 with an action (more to read/decide). */
  duration?: number
}

// Module-level store, not Context — same reasoning react-hot-toast/sonner
// use: toast() needs to be callable from anywhere (a mutation's onError,
// a plain event handler) without every caller being inside a Provider tree.
// <Toaster/> (mounted once in __root.tsx) is the only thing that subscribes.
let toasts: ToastItem[] = []
let listeners: Array<(items: ToastItem[]) => void> = []

function notify() {
  listeners.forEach((l) => l(toasts))
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export function toast(message: string, options?: ToastOptions): string {
  const id = crypto.randomUUID()
  const duration = options?.duration ?? (options?.action ? 6000 : 4000)
  toasts = [...toasts, { id, message, variant: options?.variant ?? 'default', action: options?.action, duration }]
  notify()
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration)
  }
  return id
}

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  danger: AlertCircle,
}
const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  default: 'text-text-s',
  success: 'text-accent',
  danger: 'text-danger',
}

// Mount once (in __root.tsx, alongside PostModal/NotificationsDrawer) —
// portal-rendered like every other overlay in this app (Modal, ConfirmDialog,
// ImageLightbox), same reasoning: escapes any parent's overflow/stacking context.
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(toasts)
  // `typeof document === 'undefined'` is true on the server and false on the
  // very first CLIENT render too (document always exists client-side) — that
  // guaranteed mismatch was exactly what caused React's hydration-mismatch
  // warning. `mounted` instead starts false on both server and the client's
  // first pass, only flipping true in an effect (client-only, post-hydration).
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    listeners.push(setItems)
    return () => { listeners = listeners.filter((l) => l !== setItems) }
  }, [])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="fixed z-[80] bottom-5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-5 sm:translate-x-0 flex flex-col-reverse gap-2 w-[calc(100vw-2.5rem)] max-w-sm pointer-events-none">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = VARIANT_ICON[t.variant]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
              className="pointer-events-auto flex items-start gap-3 bg-surface border border-border rounded-lg shadow-md p-4"
            >
              <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', VARIANT_ICON_CLASS[t.variant])} />
              <p className="flex-1 text-sm text-text leading-snug">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismissToast(t.id) }}
                  className="text-sm font-bold text-accent hover:text-accent-hover transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] shrink-0"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
                className="text-text-s hover:text-text transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
