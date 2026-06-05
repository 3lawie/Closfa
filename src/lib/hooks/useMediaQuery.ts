import { useState, useEffect } from 'react'

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
 * useMediaQuery — subscribes to a CSS media query.
 * Returns true when the query matches, false otherwise.
 *
 * Usage:
 *   const isDesktop = useMediaQuery('lg')
 *   const isCustom = useMediaQuery('(max-width: 900px)')
 */
export function useMediaQuery(query: Breakpoint | string): boolean {
  const mediaQuery = query in BREAKPOINTS
    ? BREAKPOINTS[query as Breakpoint]
    : query

  // Start with false to avoid SSR hydration mismatch
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(mediaQuery)
    setMatches(mql.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mediaQuery])

  return matches
}

/** Convenience hooks for common breakpoints */
export const useIsMobile = () => !useMediaQuery('md')
export const useIsTablet = () => useMediaQuery('md') && !useMediaQuery('lg')
export const useIsDesktop = () => useMediaQuery('lg')
