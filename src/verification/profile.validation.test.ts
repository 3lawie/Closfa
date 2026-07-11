import { describe, expect, it } from 'vitest'
import { claimNicknameValidation } from './profile.validation'

describe('claimNicknameValidation', () => {
  it('accepts a valid nickname', () => {
    expect(claimNicknameValidation.safeParse({ nickname: 'valid_user1' }).success).toBe(true)
  })

  it('rejects nicknames under 3 characters', () => {
    const res = claimNicknameValidation.safeParse({ nickname: 'ab' })
    expect(res.success).toBe(false)
  })

  it('rejects nicknames over 30 characters', () => {
    const res = claimNicknameValidation.safeParse({ nickname: 'a'.repeat(31) })
    expect(res.success).toBe(false)
  })

  it('rejects special characters (only letters, numbers, underscores)', () => {
    for (const bad of ['user name', 'user-name', 'user.name', 'user@name', 'ユーザー']) {
      expect(claimNicknameValidation.safeParse({ nickname: bad }).success).toBe(false)
    }
  })

  it('rejects a missing nickname field', () => {
    expect(claimNicknameValidation.safeParse({}).success).toBe(false)
  })
})
