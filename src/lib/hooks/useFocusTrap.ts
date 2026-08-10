import { useEffect, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Keeps Tab focus inside an open overlay and restores it to the trigger on
 * close. Every dialog in the app previously let Tab walk straight out into the
 * page behind the scrim.
 *
 * Deliberately does NOT set `inert`/`aria-hidden` on the app root. This app
 * hydrates the whole `document` and portals overlays to `<body>`, so there is
 * no single "rest of the app" node to mark, and getting it wrong hides content
 * from assistive tech permanently. A focus trap plus `aria-modal="true"` covers
 * the realistic cases.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  { active }: { active: boolean },
): void {
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const previouslyFocused = document.activeElement
    const preferred = container.querySelector<HTMLElement>('[data-autofocus]')
    // Falling back to the container (tabIndex={-1}) rather than the first
    // focusable: autofocusing a text input raises the on-screen keyboard, which
    // covers half a bottom sheet on mobile.
    ;(preferred ?? container).focus({ preventScroll: true })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === container)) {
        e.preventDefault()
        last.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      // The trigger may have unmounted while the overlay was open (deleting a
      // post from its own menu, say) — focusing a detached node throws focus
      // to <body> silently, so check first.
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [active, ref])
}
