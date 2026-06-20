import { getRequest } from '@tanstack/react-start/server'

/**
 * Verifies a Cloudflare Turnstile token.
 * @param token The token received from the client-side Turnstile widget
 * @returns A boolean indicating whether the token is valid
 */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY is missing, bypassing Turnstile verification.')
    return true // Bypass in dev if not configured
  }

  const request = getRequest()
  const ip = request?.headers.get('cf-connecting-ip')

  const formData = new URLSearchParams()
  formData.append('secret', secret)
  formData.append('response', token)
  if (ip) {
    formData.append('remoteip', ip)
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })

    const outcome = (await res.json()) as any
    return outcome.success
  } catch (err) {
    console.error('Turnstile verification failed:', err)
    return false
  }
}
