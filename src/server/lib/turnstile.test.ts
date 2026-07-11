import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyTurnstileToken } from './turnstile'

function fetcherReturning(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
}

describe('verifyTurnstileToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('dev + no secret → bypasses (returns true)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    vi.stubEnv('NODE_ENV', 'development')
    await expect(verifyTurnstileToken('any-token')).resolves.toBe(true)
  })

  it('production + no secret → fail-closed (returns false)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    await expect(verifyTurnstileToken('any-token')).resolves.toBe(false)
  })

  it('secret set + missing token → rejected without calling siteverify', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'sec')
    const spy = vi.fn()
    await expect(verifyTurnstileToken(undefined, { fetcher: spy as unknown as typeof fetch })).resolves.toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('siteverify success:true → accepted', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'sec')
    await expect(
      verifyTurnstileToken('tok', { fetcher: fetcherReturning({ success: true }) }),
    ).resolves.toBe(true)
  })

  it('siteverify success:false → rejected', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'sec')
    await expect(
      verifyTurnstileToken('tok', { fetcher: fetcherReturning({ success: false }) }),
    ).resolves.toBe(false)
  })

  it('network failure → rejected (fail-closed)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'sec')
    const failing = (async () => {
      throw new Error('network down')
    }) as typeof fetch
    await expect(verifyTurnstileToken('tok', { fetcher: failing })).resolves.toBe(false)
  })
})
