// ──────────────────────────────────────────────────────────────
// Auth Middleware — createMiddleware for server function protection
//
// This is the REAL security boundary of the app.
// Route guards (beforeLoad) only protect the UI navigation.
// An attacker can call createServerFn endpoints directly via HTTP POST,
// completely bypassing your route guards.
//
// This middleware ensures every protected server function validates
// the session BEFORE executing any business logic.
// ──────────────────────────────────────────────────────────────

import { createMiddleware } from '@tanstack/react-start'
import { getSession, type SessionData } from './session'

/**
 * Auth middleware — attach to any createServerFn that requires login.
 *
 * Usage:
 *   export const myProtectedFn = createServerFn({ method: 'POST' })
 *     .middleware([authMiddleware])
 *     .handler(async ({ context }) => {
 *       // context.session is guaranteed to exist here
 *       const userId = context.session.userId
 *     })
 */
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const session = await getSession()

  if (!session) {
    throw new Error('Unauthorized — please log in')
  }

  // Pass session to handler via context — fully typed
  return next({
    context: { session },
  })
})

// Re-export for convenience
export type { SessionData }
