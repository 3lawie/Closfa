import { describe, it, expect } from 'vitest'
import { buildShareTitle, buildShareDescription, SHARE_DESCRIPTION_MAX } from './shareMeta'
import type { Media, PostAuthor } from '@/lib/entities/Post'

const author = (name: string): PostAuthor => ({
  userId: 'u1', name, nickname: 'ada', profile: null,
})

const media = (type: Media['media_type'], i = 0): Media => ({
  media_id: `m${i}`,
  mediaUrl: `posts/${i}.bin`,
  media_type: type,
  fileName: `${i}.bin`,
  mimeType: type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : 'audio/mpeg',
})

describe('buildShareTitle', () => {
  it('attributes the post to its author', () => {
    expect(buildShareTitle({ primaryAuthor: author('Ada') })).toBe('Ada on Closfa')
  })

  it('falls back when there is no author, or the name is blank', () => {
    expect(buildShareTitle({ primaryAuthor: null })).toBe('A post on Closfa')
    expect(buildShareTitle({ primaryAuthor: author('   ') })).toBe('A post on Closfa')
  })
})

describe('buildShareDescription', () => {
  it('collapses whitespace so newlines do not leak into meta tags', () => {
    expect(buildShareDescription({ content: 'one\n\n  two\tthree ', media: [] }))
      .toBe('one two three')
  })

  it('truncates on a word boundary and stays within the limit', () => {
    const long = 'lorem ipsum '.repeat(40)
    const out = buildShareDescription({ content: long, media: [] })
    expect(out.length).toBeLessThanOrEqual(SHARE_DESCRIPTION_MAX)
    expect(out.endsWith('…')).toBe(true)
    // A boundary cut must not leave a half-word before the ellipsis.
    expect(out.slice(0, -1).endsWith('ipsum') || out.slice(0, -1).endsWith('lorem')).toBe(true)
  })

  it('does not add an ellipsis when nothing was cut', () => {
    expect(buildShareDescription({ content: 'short', media: [] })).toBe('short')
  })

  it('describes media when the post has no text', () => {
    expect(buildShareDescription({ content: null, media: [media('image')] }))
      .toBe('A photo')
    expect(buildShareDescription({ content: '', media: [media('image', 0), media('image', 1)] }))
      .toBe('2 photos')
  })

  it('reads correctly when several media types are mixed', () => {
    const out = buildShareDescription({
      content: null,
      media: [media('image', 0), media('image', 1), media('video', 2), media('audio', 3)],
    })
    // Only the first word is capitalised — "2 photos and A video" would be
    // wrong — and the article agrees with the noun ("an audio clip").
    expect(out).toBe('2 photos, a video and an audio clip')
  })

  it('still says something for an empty post', () => {
    expect(buildShareDescription({ content: null, media: [] })).toBe('Shared from Closfa')
  })
})
