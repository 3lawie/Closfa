import { logger } from './logger'

/**
 * Verifies a Cloudflare Turnstile token against the siteverify API.
 *
 * Fail-closed in production: a missing TURNSTILE_SECRET_KEY, a missing token,
 * or a failed verification all reject. In development a missing secret
 * bypasses verification so local work doesn't require Turnstile keys.
 *
 * No framework imports (getRequest etc.) — `ip` is an optional param and
 * `fetcher` is injectable so the decision logic is unit-testable under the
 * Workers test pool (see session.rules.ts for the pattern).
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  opts?: { ip?: string | null; fetcher?: typeof fetch },
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  const isProduction = process.env.NODE_ENV === 'production'

  if (!secret) {
    if (isProduction) {
      logger.error('TURNSTILE_SECRET_KEY missing in production — rejecting (fail-closed)')
      return false
    }
    logger.warn('TURNSTILE_SECRET_KEY missing — bypassing Turnstile verification (dev only)')
    return true
  }

  if (!token) {
    return false
  }

  const formData = new URLSearchParams()
  formData.append('secret', secret)
  formData.append('response', token)
  if (opts?.ip) {
    formData.append('remoteip', opts.ip)
  }

  try {
    const doFetch = opts?.fetcher ?? fetch
    const res = await doFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })

    const outcome: unknown = await res.json()
    return (
      typeof outcome === 'object' &&
      outcome !== null &&
      'success' in outcome &&
      (outcome as { success: unknown }).success === true
    )
  } catch (err) {
    logger.error('Turnstile verification request failed', undefined, err instanceof Error ? err : undefined)
    return false
  }
}
