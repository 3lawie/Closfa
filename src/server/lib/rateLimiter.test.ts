import { describe, expect, it } from 'vitest'
import { identifierFor } from './rateLimiter.rules'

function fakeRequest(headers: Record<string, string>) {
  return { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } }
}

describe('identifierFor — rate-limit keying', () => {
  it('keys logged-in users by userId (stable across IPs)', () => {
    const id = identifierFor({ userId: 'u_1' }, fakeRequest({ 'cf-connecting-ip': '1.2.3.4' }))
    expect(id).toBe('user:u_1')
  })

  it('keys anonymous callers by IP + user-agent composite', () => {
    const id = identifierFor(null, fakeRequest({ 'cf-connecting-ip': '1.2.3.4', 'user-agent': 'UA' }))
    expect(id).toBe('anon:1.2.3.4:UA')
  })

  it('falls back to placeholder parts when headers are missing', () => {
    expect(identifierFor(null, fakeRequest({}))).toBe('anon:unknown-ip:unknown-ua')
  })

  it('falls back to a global anonymous bucket with no request at all', () => {
    expect(identifierFor(null, null)).toBe('anonymous')
  })
})
