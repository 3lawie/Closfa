import { useCallback, useEffect, useId, useRef } from 'react'
import { isTopmostOverlay, registerOverlay } from '@/lib/overlay/overlayStack'

export interface UseOverlayOptions {
  isOpen: boolean
  onClose: () => void
  /**
   * Push a history sentinel so the mobile/browser Back button closes this
   * overlay instead of leaving the page. Set false for overlays that already
   * live in the URL (`?post=`, `?notifications=`) — they still register, for
   * Escape ordering and scroll locking, but the router owns their history.
   * @default true
   */
  backToClose?: boolean
  /** @default true */
  lockScroll?: boolean
  /** Close on Escape, but only while this overlay is topmost. @default true */
  closeOnEscape?: boolean
}

export interface UseOverlayApi {
  id: string
  /**
   * Imperative by design — call it inside event handlers, never during render.
   * Keeping stack state out of the render path is what makes the overlay
   * registry free of hydration hazards.
   */
  isTopmost: () => boolean
}

/**
 * Registers an open overlay with the shared stack, which gives it, in one
 * place: Back-button close, Escape-closes-only-the-topmost, and a ref-counted
 * body-scroll lock.
 *
 * Deliberately one hook rather than three (`useBackToClose` / `useEscape` /
 * `useScrollLock`): all three need the *same* stack entry in the *same* LIFO
 * position, and splitting them means three registrations per overlay and three
 * chances for them to disagree about which overlay is on top.
 */
export function useOverlay({
  isOpen,
  onClose,
  backToClose = true,
  lockScroll = true,
  closeOnEscape = true,
}: UseOverlayOptions): UseOverlayApi {
  const id = useId()

  // Held in a ref so a new `onClose` identity on every parent render doesn't
  // re-run the effect — re-registering would push a second history sentinel.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    // Synchronous teardown. A StrictMode double-invoke would push a sentinel
    // and pop it right back, which is a wash — and this app doesn't wrap the
    // tree in StrictMode anyway (see src/client.tsx). Deferring the unregister
    // to a microtask to "protect" against that only helps if the deferred
    // cleanup can tell it was superseded, and a per-invocation flag can't:
    // the re-run allocates a fresh one. Not worth the dead code.
    return registerOverlay({
      id,
      onClose: () => onCloseRef.current(),
      backToClose,
      lockScroll,
      closeOnEscape,
    })
  }, [isOpen, id, backToClose, lockScroll, closeOnEscape])

  return {
    id,
    isTopmost: useCallback(() => isTopmostOverlay(id), [id]),
  }
}
