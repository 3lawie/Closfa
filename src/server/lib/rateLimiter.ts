import { Ratelimit } from '@upstash/ratelimit'
import { getRequest } from '@tanstack/react-start/server'
import type { SessionData } from './session'
import { redis } from '../db/redis/index'

// Named limiter tiers. 'default' guards server functions; 'auth' is the
// stricter IP-keyed tier for /api/auth/* route handlers, which run before
// any session exists (user decision 2026-07-11: 10 req / 60 s).
const LIMITER_CONFIG = {
  default: () => Ratelimit.slidingWindow(30, '10 s'),
  auth: () => Ratelimit.slidingWindow(10, '60 s'),
} as const

export type LimiterName = keyof typeof LIMITER_CONFIG

// Lazy per-tier instances — redis is a lazy proxy, and Workers inject env
// per-request, so nothing here may run at module-eval time.
const _limiters = new Map<LimiterName, Ratelimit>()

function getRateLimiter(name: LimiterName): Ratelimit {
  let limiter = _limiters.get(name)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: LIMITER_CONFIG[name](),
      analytics: true,
      prefix: `@upstash/ratelimit:${name}`,
    })
    _limiters.set(name, limiter)
  }
  return limiter
}

export { identifierFor } from './rateLimiter.rules'
import { identifierFor } from './rateLimiter.rules'

/**
 * Enforce a rate limit for the current request.
 *
 * The session is a PARAMETER — this function no longer calls getSession()
 * itself (that cost a second JWE decrypt per request; the middleware chain
 * decrypts once and passes the result down). Route handlers with no session
 * context pass null and select the 'auth' tier.
 */
export async function checkRateLimit(
  session: SessionData | null,
  opts?: { limiter?: LimiterName },
) {
  const request = getRequest()
  const identifier = identifierFor(session, request ?? null)

  const limiter = getRateLimiter(opts?.limiter ?? 'default')
  const result = await limiter.limit(identifier)

  if (!result.success) {
    throw new Error('Rate limit exceeded. Please try again later.')
  }

  return result
}
