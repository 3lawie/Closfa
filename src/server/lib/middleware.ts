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
import { getSession, type SessionData, type SessionResult } from './session'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'

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
  const { session, status } = await getSession()

  if (!session || status === 'expired' || status === 'unauthorized') {
    throw new Error('Unauthorized — please log in')
  }

  const request = getRequest()
  if (request && request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    
    // In dev, host might be localhost:5173 but origin is http://localhost:5173
    // We only want to ensure the hostname/port matches.
    if (origin && host) {
      try {
        const originUrl = new URL(origin)
        if (originUrl.host !== host) {
          throw new Error('CSRF origin mismatch')
        }
      } catch {
        throw new Error('Invalid Origin header')
      }
    } else if (process.env.NODE_ENV === 'production') {
      // browsers always send Origin for cross-origin POSTs, and usually for same-origin too
      throw new Error('Missing Origin header for state-modifying request')
    }
  }

  if (status === 'renewed') {
    setResponseHeader('X-Session-Status', 'renewed')
  }

  // Pass session to handler via context — fully typed
  return next({
    context: { session },
  })
})

// Re-export for convenience
export type { SessionData }
