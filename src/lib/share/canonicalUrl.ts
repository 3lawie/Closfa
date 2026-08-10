import { clientEnv } from '@/lib/env/client-env'
import type { Post } from '@/lib/entities/Post'

/**
 * The canonical public origin, with no trailing slash.
 *
 * Falls back to `window.location.origin` in dev, where VITE_PUBLIC_SITE_URL is
 * usually unset. The last resort is an empty string rather than a hardcoded
 * guess: during SSR with no configured origin we emit *relative* URLs, which
 * are merely useless to an unfurl crawler. A wrong absolute origin would be
 * worse — it points shared links at somebody else's host.
 */
export function siteOrigin(): string {
  if (clientEnv.siteUrl) return clientEnv.siteUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function postUrl(postId: string): string {
  return `${siteOrigin()}/post/${postId}`
}

/**
 * A 1200×630 preview image for the post: its first image, else the first video
 * frame-grab, else nothing.
 *
 * `f-jpg` is deliberate. The feed serves AVIF, but unfurl crawlers (Facebook,
 * LinkedIn, older Slack) don't reliably decode AVIF or WebP and will silently
 * drop the card image, so the OG variant is forced to JPEG.
 */
export function ogImageUrl(post: Pick<Post, 'media'>): string | undefined {
  const image = post.media.find((m) => m.media_type === 'image')
  if (image) return imagekitOgUrl(image.mediaUrl)

  const video = post.media.find(
    (m) => m.media_type === 'video' && (m.thumbnailUrl ?? '').trim() !== '',
  )
  const thumb = video?.thumbnailUrl
  if (thumb) return imagekitOgUrl(thumb)

  return undefined
}

function imagekitOgUrl(path: string): string {
  const endpoint = clientEnv.imagekitUrlEndpoint.replace(/\/+$/, '')
  return `${endpoint}/tr:w-1200,h-630,cm-pad_resize,bg-FFFFFF,f-jpg,q-80/${path.replace(/^\/+/, '')}`
}
