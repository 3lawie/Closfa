import { describe, it, expect } from 'vitest'
import { SHARE_TARGETS, buildShareHref, type ShareContext } from './shareTargets'

const ctx: ShareContext = {
  url: 'https://closfa.mly445032.workers.dev/post/abc123',
  title: 'Ada on Closfa',
  // Deliberately hostile: an ampersand and a hash would break query parsing,
  // and the space is what a naive template would leave raw.
  text: 'Tea & biscuits #thoughts',
}

describe('share targets', () => {
  it('exposes every network exactly once, in a stable order', () => {
    expect(SHARE_TARGETS.map((t) => t.id)).toEqual([
      'x', 'whatsapp', 'telegram', 'facebook', 'linkedin', 'reddit', 'email',
    ])
  })

  it('percent-encodes every interpolated value', () => {
    for (const target of SHARE_TARGETS) {
      const href = target.href(ctx)
      // A raw space or bare ampersand from the post body would mean an
      // unencoded interpolation somewhere in the template.
      expect(href, target.id).not.toMatch(/ /)
      expect(href, target.id).not.toContain('Tea &')
      expect(href, target.id).not.toContain('#thoughts')
    }
  })

  it('carries the post URL to every network', () => {
    for (const target of SHARE_TARGETS) {
      expect(decodeURIComponent(target.href(ctx)), target.id).toContain(ctx.url)
    }
  })

  it('folds the URL into WhatsApp’s single text param', () => {
    const href = buildShareHref('whatsapp', ctx)
    expect(href.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(href)).toContain(`${ctx.text} ${ctx.url}`)
  })

  it('keeps the mailto blank line literal, not encoded', () => {
    const href = buildShareHref('email', ctx)
    // %250A would mean the % itself got encoded, turning the separator into
    // visible junk in the user's mail client.
    expect(href).toContain('%0A%0A')
    expect(href).not.toContain('%250A')
  })

  it('gives every target an accessible label', () => {
    for (const target of SHARE_TARGETS) {
      expect(target.ariaLabel.length, target.id).toBeGreaterThan(0)
      expect(target.label.length, target.id).toBeGreaterThan(0)
    }
  })

  it('throws on an unknown network rather than returning a broken href', () => {
    // @ts-expect-error — exercising the runtime guard for an invalid id.
    expect(() => buildShareHref('myspace', ctx)).toThrow(/myspace/)
  })
})
