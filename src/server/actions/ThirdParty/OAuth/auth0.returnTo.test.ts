import { describe, expect, it } from 'vitest'
import { sanitizeReturnTo } from './auth0.rules'

describe('sanitizeReturnTo — open-redirect guard', () => {
  it('accepts plain same-origin relative paths', () => {
    expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard')
    expect(sanitizeReturnTo('/dashboard?x=1')).toBe('/dashboard?x=1')
    expect(sanitizeReturnTo('/post/abc123')).toBe('/post/abc123')
    expect(sanitizeReturnTo('/')).toBe('/')
  })

  it('rejects absolute URLs', () => {
    expect(sanitizeReturnTo('https://evil.com')).toBeNull()
    expect(sanitizeReturnTo('http://evil.com/phish')).toBeNull()
  })

  it('rejects protocol-relative URLs', () => {
    expect(sanitizeReturnTo('//evil.com')).toBeNull()
    expect(sanitizeReturnTo('//evil.com/path')).toBeNull()
  })

  it('rejects backslash smuggling (browsers normalize \\ to /)', () => {
    expect(sanitizeReturnTo('/\\evil.com')).toBeNull()
    expect(sanitizeReturnTo('/dash\\board')).toBeNull()
  })

  it('rejects embedded control chars (URL parser strips tab/CR/LF/DEL to cross-origin)', () => {
    // Built via char codes so the control byte is unambiguous in source:
    // TAB(9), LF(10), CR(13), DEL(127), placed right after the leading slash.
    const withCtrl = (code: number) => '/' + String.fromCharCode(code) + '/evil.com'
    expect(sanitizeReturnTo(withCtrl(9))).toBeNull()
    expect(sanitizeReturnTo(withCtrl(10))).toBeNull()
    expect(sanitizeReturnTo(withCtrl(13))).toBeNull()
    expect(sanitizeReturnTo(withCtrl(127))).toBeNull()
  })

  it('rejects scheme smuggling', () => {
    expect(sanitizeReturnTo('javascript:alert(1)')).toBeNull()
    expect(sanitizeReturnTo('data:text/html,x')).toBeNull()
  })

  it('rejects empty, null, and oversized inputs', () => {
    expect(sanitizeReturnTo(null)).toBeNull()
    expect(sanitizeReturnTo(undefined)).toBeNull()
    expect(sanitizeReturnTo('')).toBeNull()
    expect(sanitizeReturnTo('/' + 'a'.repeat(600))).toBeNull()
  })

  it('rejects relative paths without a leading slash', () => {
    expect(sanitizeReturnTo('dashboard')).toBeNull()
    expect(sanitizeReturnTo('./dashboard')).toBeNull()
  })
})
