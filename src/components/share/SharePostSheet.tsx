import { useSyncExternalStore } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Copy, Share2 } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { BrandIcon } from '@/components/share/brandIcons'
import { toast } from '@/components/ui/Toast'
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard'
import { SHARE_TARGETS, type ShareContext } from '@/lib/share/shareTargets'
import { postUrl } from '@/lib/share/canonicalUrl'
import { buildShareTitle, buildShareDescription } from '@/lib/share/shareMeta'
import { incrementShareFn } from '@/server/actions/Database/services/post.service'
import type { Post } from '@/lib/entities/Post'

export interface SharePostSheetProps {
  isOpen: boolean
  onClose: () => void
  post: Pick<Post, 'postId' | 'content' | 'media' | 'primaryAuthor'>
  onShareCounted?: () => void
}

/**
 * Posts already counted in this page session. The old single button counted one
 * share per click; a sheet with eight click targets would inflate the number
 * roughly eightfold, since trying WhatsApp and then falling back to copy-link
 * is one share by any honest definition. Module-level so it survives the sheet
 * unmounting between opens.
 *
 * This is client-side only and therefore advisory. Real enforcement belongs in
 * incrementShareFn, which already has Upstash available through its rate
 * limiter — deliberately left as a separate change, since it alters a server
 * function's semantics.
 */
const countedThisSession = new Set<string>()

export function SharePostSheet({ isOpen, onClose, post, onShareCounted }: SharePostSheetProps) {
  const { copied, copy } = useCopyToClipboard()

  // Capability detection, not device detection: desktop Safari and Edge
  // implement navigator.share too, so "is this mobile" is the wrong question.
  //
  // useSyncExternalStore rather than an effect + setState — it gives an
  // explicit server snapshot (false), so hydration matches without a cascading
  // re-render. The subscribe function is a no-op because the answer can't
  // change during a session.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.share === 'function',
    () => false,
  )

  const url = postUrl(post.postId)
  const title = buildShareTitle(post)
  const text = buildShareDescription(post)
  const ctx: ShareContext = { url, title, text }

  const shareMutation = useMutation({
    mutationFn: () => incrementShareFn({ data: { postId: post.postId } }),
  })

  function countShare() {
    if (countedThisSession.has(post.postId)) return
    countedThisSession.add(post.postId)
    shareMutation.mutate()
    onShareCounted?.()
  }

  async function handleCopy() {
    if (await copy(url)) {
      toast('Link copied to clipboard', { variant: 'success' })
      countShare()
    } else {
      // No clipboard access (denied, or a non-secure origin). Show the link
      // itself with no auto-dismiss so it can still be selected by hand.
      toast(url, { duration: 0 })
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({ title, text, url })
      countShare()
    } catch (err) {
      // Dismissing the OS sheet is not a failure — it's the user saying no.
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast('Could not open the share menu', { variant: 'danger' })
    }
  }

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Share post">
      <div className="flex flex-col gap-5">
        {/* Targets are real anchors, not window.open calls — that keeps
            middle-click, "open in new window" and popup blockers working. */}
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SHARE_TARGETS.map((target) => (
            <li key={target.id}>
              <a
                href={target.href(ctx)}
                aria-label={target.ariaLabel}
                onClick={countShare}
                {...(target.id === 'email'
                  ? {}
                  : { target: '_blank', rel: 'noopener noreferrer' })}
                className="flex flex-col items-center gap-1.5 py-2 rounded-lg text-text-s hover:text-text hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <BrandIcon network={target.id} />
                <span className="text-[11px] font-medium">{target.label}</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={url}
            aria-label="Post link"
            // Selects the whole link on focus so keyboard users can Ctrl+C it
            // directly. Not autofocused: on mobile that raises the keyboard
            // over the sheet.
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 h-10 px-3 rounded-lg bg-bg border border-border text-sm text-text-s truncate focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleCopy}
            className="shrink-0 h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          >
            {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} strokeWidth={2.5} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* An icon swap is invisible to a screen reader; announce it. */}
        <span aria-live="polite" className="sr-only">{copied ? 'Link copied' : ''}</span>

        {canNativeShare && (
          <button
            onClick={handleNativeShare}
            className="h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-border text-sm font-semibold text-text-s hover:text-text hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          >
            <Share2 size={16} strokeWidth={2.5} />
            More options
          </button>
        )}
      </div>
    </Sheet>
  )
}
