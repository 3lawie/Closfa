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
//
// Structure (README Rule 1 — decrypt the session once per request):
//   sessionMiddleware  — the ONLY place getSession() runs in a server-fn
//                        chain; provides { session, status } via context.
//   authMiddleware     — depends on sessionMiddleware; enforces login + CSRF.
//   optionalAuthMiddleware — same, but allows a null session (guests).
//   rateLimiterMiddleWare  — depends on sessionMiddleware; consumes
//                        context.session instead of re-decrypting.
// TanStack Start dedupes a middleware that appears in multiple dependency
// arrays by instance, so [authMiddleware, rateLimiterMiddleWare] runs
// sessionMiddleware once. If a runtime version ever didn't dedupe, the
// worst case is one extra decrypt (the pre-refactor status quo) — never
// a correctness bug, because every consumer reads the same cookie.
// ──────────────────────────────────────────────────────────────

import { createMiddleware } from '@tanstack/react-start'
import { getSession, type SessionData, type SessionResult } from './session'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { checkRateLimit, type LimiterName } from './rateLimiter'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

/**
 * CSRF origin enforcement for state-modifying requests — identical rules to
 * the pre-refactor per-middleware copies (kept as one function so auth and
 * optional-auth can't drift apart again).
 */
function enforceCsrfOrigin(): void {
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
}

/**
 * Session middleware — decrypts the session cookie ONCE and shares the result
 * with everything downstream via context. Never attach this directly to a
 * server fn; depend on it from auth/optionalAuth/rateLimiter instead.
 *
 * Deliberately provides `sessionResult` — NOT `session`. Context types merge
 * in array order, so if this also claimed the `session` key, a chain like
 * [authMiddleware, rateLimiterMiddleWare] would re-widen the auth-narrowed
 * `session: SessionData` back to `SessionData | null` in every handler.
 */
export const sessionMiddleware = createMiddleware().server(async ({ next }) => {
  const result: SessionResult = await getSession()

  if (result.status === 'renewed') {
    setResponseHeader('X-Session-Status', 'renewed')
  }

  return next({
    context: {
      sessionResult: result,
    },
  })
})

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
export const authMiddleware = createMiddleware()
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    const { session, status } = context.sessionResult

    if (!session || status === 'expired' || status === 'unauthorized') {
      throw new Error('Unauthorized — please log in')
    }

    enforceCsrfOrigin()

    // A ban must take effect on the very next request, not wait for the
    // session cookie to expire naturally — so this is a live DB read on
    // every authed call, same tradeoff getGlobalPermission already makes
    // for role checks (never session-cached).
    const [bannedCheck] = await db
      .select({ isBanned: schema.user.isBanned })
      .from(schema.user)
      .where(eq(schema.user.userId, session.userId))
      .limit(1)
    if (bannedCheck?.isBanned) {
      throw new Error('Account suspended')
    }

    // Narrow session to non-null for handlers — fully typed
    return next({
      context: { session },
    })
  })

// Re-export for convenience
export type { SessionData }

/**
 * Optional Auth middleware — use when a route can be accessed by both guests and users.
 * If the user is logged in, context.session will be populated.
 * If the user is a guest, context.session will be null.
 * It still performs CSRF protection on POST/PUT/DELETE requests.
 */
export const optionalAuthMiddleware = createMiddleware()
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    enforceCsrfOrigin()

    return next({
      context: { session: context.sessionResult.session ?? null },
    })
  })

/**
 * Rate limiter — consumes the session already decrypted by sessionMiddleware
 * (it previously called getSession() itself, costing a second JWE decrypt on
 * every [auth, rateLimiter] chain).
 */
export const rateLimiterMiddleWare = createMiddleware()
  .middleware([sessionMiddleware])
  .server(async ({ next, context }) => {
    await checkRateLimit(context.sessionResult.session)
    return next()
  })

/**
 * Same as rateLimiterMiddleWare but pinned to a non-default tier — for
 * endpoints that need a stricter (or looser) limit than every other server
 * fn. Factory, not a fixed export, so existing call sites are untouched.
 */
export function rateLimiterMiddlewareFor(tier: LimiterName) {
  return createMiddleware()
    .middleware([sessionMiddleware])
    .server(async ({ next, context }) => {
      await checkRateLimit(context.sessionResult.session, { limiter: tier })
      return next()
    })
}
