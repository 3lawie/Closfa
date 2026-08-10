import type { Post } from '@/lib/entities/Post'

export const SHARE_DESCRIPTION_MAX = 200

/** Used for og:title, the share sheet heading, and the Reddit/email subject. */
export function buildShareTitle(post: Pick<Post, 'primaryAuthor'>): string {
  const name = post.primaryAuthor?.name.trim()
  return name ? `${name} on Closfa` : 'A post on Closfa'
}

/**
 * og:description and the prefilled body of every share target. Media-only posts
 * still get a meaningful line — an empty description makes an unfurl card look
 * broken.
 */
export function buildShareDescription(post: Pick<Post, 'content' | 'media'>): string {
  const text = post.content?.replace(/\s+/g, ' ').trim() ?? ''
  if (text) return truncateOnWordBoundary(text, SHARE_DESCRIPTION_MAX)
  return describeMedia(post.media) ?? 'Shared from Closfa'
}

function truncateOnWordBoundary(str: string, max: number): string {
  if (str.length <= max) return str
  // -1 leaves room for the ellipsis, so the result never exceeds `max`.
  const cut = str.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

function describeMedia(media: Post['media']): string | undefined {
  const parts = [
    countPhrase(media.filter((m) => m.media_type === 'image').length, 'a photo', 'photos'),
    countPhrase(media.filter((m) => m.media_type === 'video').length, 'a video', 'videos'),
    countPhrase(media.filter((m) => m.media_type === 'audio').length, 'an audio clip', 'audio clips'),
  ].filter((p): p is string => p !== undefined)

  if (parts.length === 0) return undefined
  // Phrases are built lowercase so they read correctly mid-list ("a photo and
  // a video", not "A photo and A video"); only the whole line gets capitalised.
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/** `singular` carries its own article, so "an audio clip" reads correctly. */
function countPhrase(n: number, singular: string, plural: string): string | undefined {
  if (n === 0) return undefined
  return n === 1 ? singular : `${n} ${plural}`
}
