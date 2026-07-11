import { describe, expect, it } from 'vitest'
import { ok, err, toValidationIssues, type ServerResult } from './result'
import { z } from 'zod'

describe('result constructors', () => {
  it('ok() builds the success arm with a narrowed discriminant', () => {
    const res: ServerResult<{ id: string }> = ok({ id: 'x' })
    expect(res).toEqual({ ok: true, data: { id: 'x' } })
    if (res.ok) expect(res.data.id).toBe('x') // discriminant narrows without casts
  })

  it('err() builds the failure arm and omits issues when absent', () => {
    const res = err('NOT_FOUND', 'Post not found')
    expect(res).toEqual({ ok: false, error: 'NOT_FOUND', message: 'Post not found' })
    expect('issues' in res).toBe(false)
  })

  it('err() carries wire-safe issues when provided', () => {
    const res = err('BAD_REQUEST', 'Invalid input', [{ path: 'nickname', message: 'Too short' }])
    if (!res.ok) {
      expect(res.issues).toEqual([{ path: 'nickname', message: 'Too short' }])
    }
  })

  it('toValidationIssues() strips Zod internals down to path + message', () => {
    const schema = z.object({ nickname: z.string().min(3, 'Nickname must be at least 3 characters') })
    const parsed = schema.safeParse({ nickname: 'ab' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const issues = toValidationIssues(parsed.error.issues)
      expect(issues).toEqual([{ path: 'nickname', message: 'Nickname must be at least 3 characters' }])
    }
  })
})
