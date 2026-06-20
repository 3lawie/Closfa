// ──────────────────────────────────────────────────────────────
// useAuthGuard — client-side hook to access session data
//
// WHY is this a hook instead of useContext?
//   Session data is loaded in the loader of the _authenticated layout
//   route and passed down via TanStack Router's context mechanism.
//   Route loaders run on the server (SSR) and client (hydration),
//   so the session is available before first render — no loading flash.
// ──────────────────────────────────────────────────────────────

import { useRouteContext } from '@tanstack/react-router'
import type { SessionData } from '@/server/lib/session'

/**
 * Access the session from within any _authenticated route.
 * Returns the session object guaranteed to be non-null inside
 * authenticated routes (the layout route redirects if not logged in).
 */
export function useAuthGuard(): { session: SessionData } {
  const context = useRouteContext({ from: '/_authenticated' })
  return { session: context.session as SessionData }
}

/**
 * Check if the user has a specific permission on a profile.
 * Pass the permission result from getProfilePermission().
 */
export function useHasPermission(
  permission: Record<string, unknown> | null | undefined,
  check: string,
): boolean {
  if (!permission || !('authorized' in permission) || !permission.authorized) return false
  return !!permission[check]
}
