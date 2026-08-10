import { useCallback, useSyncExternalStore } from 'react'

// Tailwind v4 default breakpoints
const BREAKPOINTS = {
  sm: '(min-width: 640px)',
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
  '2xl': '(min-width: 1536px)',
} as const

type Breakpoint = keyof typeof BREAKPOINTS

/**
 * Subscribes to a CSS media query. True when it matches.
 *
 *   const isDesktop = useMediaQuery('lg')
 *   const isCustom = useMediaQuery('(max-width: 900px)')
 *
 * Built on useSyncExternalStore rather than useState + useEffect. The previous
 * version called setState synchronously inside its effect to catch up with the
 * real match state after mounting, which is a cascading extra render on every
 * consumer. useSyncExternalStore expresses the same thing directly: subscribe
 * to matchMedia, read the live value, and hand SSR an explicit `false`.
 *
 * That server snapshot is a real constraint, not an implementation detail: the
 * first client render must agree with the server, so any layout that branches
 * on this will flash the desktop variant before correcting. Prefer a CSS
 * breakpoint whenever the choice is purely visual; reach for this only when the
 * behaviour, not the styling, has to differ.
 */
export function useMediaQuery(query: Breakpoint | string): boolean {
  const mediaQuery = query in BREAKPOINTS ? BREAKPOINTS[query as Breakpoint] : query

  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(mediaQuery)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [mediaQuery],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mediaQuery).matches,
    () => false,
  )
}

/** Convenience hooks for common breakpoints */
export const useIsMobile = () => !useMediaQuery('md')
export const useIsDesktop = () => useMediaQuery('lg')

export function useIsTablet(): boolean {
  // Both calls must be unconditional. Written as `useMediaQuery('md') &&
  // !useMediaQuery('lg')` the second was short-circuited away whenever the
  // first was false, so the hook order changed between renders.
  const atLeastMd = useMediaQuery('md')
  const atLeastLg = useMediaQuery('lg')
  return atLeastMd && !atLeastLg
}
