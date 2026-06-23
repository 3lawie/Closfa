// c:\acods\fullstack\webites\huge\closfa\src\server\lib\rateLimiter.ts
import { Ratelimit } from '@upstash/ratelimit'
import { getRequest } from '@tanstack/react-start/server'
import { getSession } from './session'
import { redis } from '../db/redis/index' // <--- Import your new proxy

// The rate limiter also needs to be lazy-loaded because it needs 'redis'
let _globalRateLimit: Ratelimit | null = null

// Helper to get the rate limiter safely
function getRateLimiter() {
  if (!_globalRateLimit) {
    _globalRateLimit = new Ratelimit({
      redis, // This is your Proxy! It will automatically connect if needed.
      limiter: Ratelimit.slidingWindow(30, '10 s'),
      analytics: true,
    })
  }
  return _globalRateLimit
}

export async function checkRateLimit() {
  const { session } = await getSession()
  const request = getRequest()

  let identifier = 'anonymous'
  if (session?.userId) {
    identifier = `user:${session.userId}`
  } else if (request) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown-ip'
    const userAgent = request.headers.get('user-agent') || 'unknown-ua'
    identifier = `anon:${ip}:${userAgent}`
  }

  // Use the lazy-loaded limiter
  const limiter = getRateLimiter()
  const result = await limiter.limit(identifier)

  if (!result.success) {
    throw new Error('Rate limit exceeded. Please try again later.')
  }

  return result
}