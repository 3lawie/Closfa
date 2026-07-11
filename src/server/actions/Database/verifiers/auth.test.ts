import { describe, expect, it } from 'vitest'
import { verifyIsOwner } from './auth'

// Simplest possible target: a pure authorization function with no DB or
// session dependency (pattern 7's verifier layer). Proves the Workers
// Vitest pool is wired up end to end before any real test suite exists.
describe('verifyIsOwner', () => {
  it('authorizes when the session user matches the resource owner', () => {
    const result = verifyIsOwner('user_1', 'user_1')
    expect(result).toEqual({ ok: true, userId: 'user_1' })
  })

  it('rejects when the session user does not match the resource owner', () => {
    const result = verifyIsOwner('user_1', 'user_2')
    expect(result).toEqual({ ok: false, message: 'You do not own this resource' })
  })
})
