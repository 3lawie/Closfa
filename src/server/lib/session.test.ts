import { describe, expect, it } from 'vitest'
import { evaluateSessionPayload } from './session.rules'

const WEEK = 60 * 60 * 24 * 7
const DAY = 60 * 60 * 24

describe('evaluateSessionPayload — sliding-window session rules', () => {
  const now = 1_800_000_000 // fixed reference instant

  it('valid: fresh session well within its window', () => {
    const session = { issuedAt: now - DAY, expiresAt: now + WEEK - DAY }
    expect(evaluateSessionPayload(session, now)).toBe('valid')
  })

  it('renew: less than 25% of the window remains', () => {
    const session = { issuedAt: now - 6 * DAY, expiresAt: now + DAY } // 1 of 7 days left
    expect(evaluateSessionPayload(session, now)).toBe('renew')
  })

  it('expired: expiresAt is in the past', () => {
    const session = { issuedAt: now - 8 * DAY, expiresAt: now - DAY }
    expect(evaluateSessionPayload(session, now)).toBe('expired')
  })

  it('expired: 30-day absolute cap wins even if expiresAt is in the future', () => {
    // Kept alive by renewals for 31 days — the absolute cap forces re-auth.
    const session = { issuedAt: now - 31 * DAY, expiresAt: now + 3 * DAY }
    expect(evaluateSessionPayload(session, now)).toBe('expired')
  })

  it('boundary: exactly at the renewal threshold is still valid (strict <)', () => {
    const threshold = WEEK * 0.25
    const session = { issuedAt: now - DAY, expiresAt: now + threshold }
    expect(evaluateSessionPayload(session, now)).toBe('valid')
  })
})
