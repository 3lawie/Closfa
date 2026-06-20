import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from './session'

let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv()
  } else {
    console.warn("Upstash Redis credentials not found, rate limiting will be bypassed.")
  }
} catch (e) {
  console.warn("Failed to initialize Upstash Redis:", e)
}

export const globalRateLimit = redis ? new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '10 s'), // 30 requests per 10 seconds
  analytics: true,
}) : null

/**
 * Check if the current request is within the rate limit.
 * Uses a composite key for anonymous users: IP + User-Agent
 * Uses the userId for authenticated users.
 */
export async function checkRateLimit() {
  if (!globalRateLimit) {
    // Bypass if not configured
    return { success: true, limit: 30, remaining: 30, reset: 0 }
  }

  const { session } = await getSession()
  const request = getRequest()
  
  let identifier = 'anonymous'
  
  if (session?.userId) {
    identifier = `user:${session.userId}`
  } else if (request) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown-ip'
    const userAgent = request.headers.get('user-agent') || 'unknown-ua'
    // Composite key to prevent simple IP spoofing / proxy hopping from bypassing limits entirely
    identifier = `anon:${ip}:${userAgent}`
  }

  const result = await globalRateLimit.limit(identifier)
  
  if (!result.success) {
    // We throw a generic error here, which should be caught and transformed into a ServerResult later
    throw new Error('Rate limit exceeded. Please try again later.')
  }

  return result
}
