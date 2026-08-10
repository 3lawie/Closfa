/**
 * A module-level LIFO registry of open overlays (modals, dialogs, sheets,
 * lightboxes).
 *
 * WHY a shared module rather than per-component effects:
 *
 *   1. `popstate` broadcasts to *every* listener. If each overlay attached its
 *      own, one Back press would close all of them at once. Exactly one
 *      listener exists here, and it consults the stack to close only the top.
 *   2. Escape had the same bug before this module: `Modal` and `ImageLightbox`
 *      each registered a non-capturing `document` keydown, so Escape with the
 *      lightbox open inside the post modal closed both.
 *   3. Body-scroll lock has to be ref-counted. The lightbox used to clear
 *      `body.overflow` unconditionally on unmount, unlocking the page behind a
 *      still-open modal.
 *
 * Nothing here is reactive on purpose — no store, no subscription. Callers ask
 * imperatively from inside event handlers (`isTopmostOverlay`, `hasOpenOverlay`),
 * never during render, which keeps the whole module off the SSR/hydration path.
 */

export interface OverlayRegistration {
  id: string
  onClose: () => void
  /** Push a history sentinel so the mobile/browser Back button closes this. */
  backToClose: boolean
  lockScroll: boolean
  closeOnEscape: boolean
}

interface InternalEntry extends OverlayRegistration {
  /** `location.href` at register time — see the orphan check in `unregister`. */
  href: string
  /** A user-initiated Back already popped our sentinel; don't pop it again. */
  consumed: boolean
  /** Whether we actually pushed a sentinel (false when backToClose is off). */
  pushed: boolean
}

const SENTINEL_KEY = '__closfaOverlay'

const stack: InternalEntry[] = []
let overlayToken = 0

/**
 * Counts sentinel pops *we* initiated, so the resulting `popstate` is ignored
 * instead of being mistaken for the user pressing Back (which would re-enter
 * the close path). A counter rather than a boolean: two nested overlays can
 * unmount in the same React commit and both call `history.back()`.
 */
let pendingSyntheticPops = 0

let lockCount = 0
let savedOverflow = ''
let listenersAttached = false

function lockScroll(): void {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
}

function unlockScroll(): void {
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow
    savedOverflow = ''
  }
}

function pushSentinel(): void {
  overlayToken += 1
  const current = window.history.state as Record<string, unknown> | null
  // The *prototype* method, deliberately. TanStack's history layer replaces
  // `window.history.pushState` with a wrapper that notifies the router, which
  // would re-run the root `beforeLoad` — a `getSession` server round-trip on
  // every overlay open. The prototype is untouched, so this push is invisible
  // to the router.
  //
  // Spreading the current state is also load-bearing: the router computes
  // `next.state.__TSR_index - current.state.__TSR_index`, and a bare state
  // object makes that NaN. Copying it forward keeps the delta at 0.
  History.prototype.pushState.call(
    window.history,
    { ...current, [SENTINEL_KEY]: overlayToken },
    '',
    window.location.href, // same URL — no visible change, no hash pollution
  )
}

function handlePopState(): void {
  if (pendingSyntheticPops > 0) {
    pendingSyntheticPops -= 1
    return
  }

  const top = stack[stack.length - 1]
  if (!top) return

  if (top.backToClose && top.pushed && window.location.href === top.href) {
    // The browser has already removed our sentinel entry, so the unregister
    // path must not pop again — that would eject the user off the page.
    top.consumed = true
    top.onClose()
    return
  }

  // Either the top overlay is URL-driven (its own router entry handles Back),
  // or we've genuinely moved elsewhere. Close everything and pop nothing;
  // each entry's own unregister does the scroll/history cleanup.
  for (const entry of [...stack]) {
    entry.consumed = true
    entry.onClose()
  }
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing) return
  if (closeTopmostOverlay()) e.preventDefault()
}

function attachListeners(): void {
  if (listenersAttached) return
  window.addEventListener('popstate', handlePopState)
  window.addEventListener('keydown', handleKeyDown)
  listenersAttached = true
}

function detachListeners(): void {
  if (!listenersAttached) return
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('keydown', handleKeyDown)
  listenersAttached = false
}

/**
 * Registers an open overlay. Returns the unregister function — call it when the
 * overlay closes or unmounts. Only ever call this from an effect: it touches
 * `window` and `document` directly, which is what keeps the module SSR-safe
 * without a `typeof window` guard on every line.
 */
export function registerOverlay(reg: OverlayRegistration): () => void {
  const entry: InternalEntry = {
    ...reg,
    href: window.location.href,
    consumed: false,
    pushed: false,
  }

  if (entry.lockScroll) lockScroll()
  if (entry.backToClose) {
    pushSentinel()
    entry.pushed = true
  }

  stack.push(entry)
  if (stack.length === 1) attachListeners()

  return (): void => {
    const idx = stack.indexOf(entry)
    if (idx !== -1) stack.splice(idx, 1)

    if (entry.lockScroll) unlockScroll()

    // Pop our sentinel so a later Back press isn't wasted on a dead entry.
    // Skipped when the user's own Back already consumed it, and when the URL
    // has moved on — a modal left open across a navigation must not rewind a
    // real route. The cost of leaving an orphaned sentinel behind is one Back
    // press that lands on the same URL; the cost of the alternative is losing
    // the user's place.
    if (entry.pushed && !entry.consumed && window.location.href === entry.href) {
      pendingSyntheticPops += 1
      window.history.back()
    }

    if (stack.length === 0) detachListeners()
  }
}

export function isTopmostOverlay(id: string): boolean {
  const top = stack[stack.length - 1]
  return top !== undefined && top.id === id
}

export function hasOpenOverlay(): boolean {
  return stack.length > 0
}

/**
 * Closes the topmost overlay. Returns false when nothing is open, or when the
 * top overlay opted out of Escape — in that case the press is swallowed rather
 * than falling through to the overlay beneath it, which the user can't see.
 */
export function closeTopmostOverlay(): boolean {
  const top = stack[stack.length - 1]
  if (!top || !top.closeOnEscape) return false
  top.onClose()
  return true
}
