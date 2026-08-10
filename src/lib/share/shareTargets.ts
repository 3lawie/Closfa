/**
 * Pure share-intent URL builders. No React, no DOM — importable anywhere and
 * directly unit-testable in the workerd test runtime.
 */

export type ShareNetwork = 'x' | 'whatsapp' | 'telegram' | 'facebook' | 'linkedin' | 'reddit' | 'email'

export interface ShareContext {
  url: string
  title: string
  text: string
}

export interface ShareTarget {
  id: ShareNetwork
  label: string
  ariaLabel: string
  href: (ctx: ShareContext) => string
}

/**
 * Facebook and LinkedIn accept only a URL — they discard any title or text you
 * pass. Their card is generated entirely from the target page's OG tags, which
 * is why the `head:` metadata on /post/$postId is the real work behind those
 * two buttons.
 */
export const SHARE_TARGETS: readonly ShareTarget[] = [
  {
    id: 'x',
    label: 'X',
    ariaLabel: 'Share on X',
    href: ({ url, text }) =>
      `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    ariaLabel: 'Share on WhatsApp',
    // WhatsApp takes a single `text` param; the URL has to be folded into it.
    href: ({ url, text }) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    ariaLabel: 'Share on Telegram',
    href: ({ url, text }) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    ariaLabel: 'Share on Facebook',
    href: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    ariaLabel: 'Share on LinkedIn',
    href: ({ url }) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    ariaLabel: 'Share on Reddit',
    href: ({ url, title }) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  },
  {
    id: 'email',
    label: 'Email',
    ariaLabel: 'Share by email',
    // %0A%0A is a literal blank line in the mailto body — it must stay raw, so
    // the text and url are encoded separately around it.
    href: ({ url, title, text }) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}%0A%0A${encodeURIComponent(url)}`,
  },
]

export function buildShareHref(id: ShareNetwork, ctx: ShareContext): string {
  const target = SHARE_TARGETS.find((t) => t.id === id)
  // A programmer error, not a user-facing failure — the error contract's
  // ok:false shape is for expected business outcomes, not unreachable branches.
  if (!target) throw new Error(`Unknown share network: ${id}`)
  return target.href(ctx)
}
