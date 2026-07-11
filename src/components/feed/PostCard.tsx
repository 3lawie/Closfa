import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toggleLike } from '@/server/actions/Database/services/like.service'
import { deletePost } from '@/server/actions/Database/services/post.service'
import { cn } from '@/lib/utils/cn'
import { formatRelativeTime, formatCount } from '@/lib/utils/format'
import { clientEnv } from '@/lib/env/client-env'
import type { Post, Media, PostAuthor } from '@/lib/entities/Post'

// ── Icons ────────────────────────────────────────────────────
function IconHeart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden>
      {filled ? (
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" />
      ) : (
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      )}
    </svg>
  )
}

function IconComment() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden>
      <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function IconVerified() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-label="Verified">
      <path d="M22 12l-2.2-2.5.3-3.3-3.3-.7L15 3l-3 1.3L9 3 7.2 5.5l-3.3.7.3 3.3L2 12l2.2 2.5-.3 3.3 3.3.7L9 21l3-1.3 3 1.3 1.8-2.5 3.3-.7-.3-3.3z" fill="currentColor" />
      <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="w-[16px] h-[16px]" aria-hidden>
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ author }: { author: PostAuthor }) {
  const avatarMedia = author.profile?.avatar
  const initial = (author.name || author.nickname || '?').charAt(0).toUpperCase()

  if (avatarMedia) {
    const url = `${clientEnv.imagekitUrlEndpoint}/tr:w-80,h-80,fo-face,c-at_max,f-avif/${avatarMedia}`
    return (
      <img
        src={url}
        alt={author.name}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        style={{ border: '1.5px solid var(--border)' }}
      />
    )
  }

  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 select-none overflow-hidden"
      style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1.5px solid var(--accent-border)' }}
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  )
}

// ── Media Grid ────────────────────────────────────────────────
function MediaGrid({ media }: { media: Media[] }) {
  if (!media.length) return null

  const IK = clientEnv.imagekitUrlEndpoint
  const images = media.filter((m: any) => m.media_type === 'image')
  const videos = media.filter((m: any) => m.media_type === 'video')
  const audios = media.filter((m: any) => m.media_type === 'audio')

  const displayMedia = [...videos.slice(0, 1), ...images.slice(0, 4)].slice(0, 4)

  return (
    <div className="mt-3 flex flex-col gap-2">
      {displayMedia.length > 0 && (
        <div
          className={cn(
            'overflow-hidden rounded-xl',
            displayMedia.length >= 2 && 'grid gap-0.5',
            displayMedia.length === 2 && 'grid-cols-2',
            displayMedia.length === 3 && 'grid-cols-3',
            displayMedia.length === 4 && 'grid-cols-2',
          )}
        >
          {displayMedia.map((m: any, i: number) => {
            if (m.media_type === 'video') {
              return (
                <div key={m.mediaUrl} className="relative bg-black aspect-video overflow-hidden" style={displayMedia.length === 1 ? { borderRadius: '0.75rem', border: '1px solid var(--border)' } : {}}>
                  <video
                    src={`${IK}/${m.mediaUrl}`}
                    className="w-full h-full object-contain"
                    controls
                    preload="metadata"
                  />
                </div>
              )
            }

            const transforms = displayMedia.length === 1 ? 'tr:w-800,c-at_max,f-avif' : 'tr:w-400,h-400,c-at_max,f-avif'
            const src = `${IK}/${transforms}/${m.mediaUrl}`

            return (
              <div
                key={m.mediaUrl}
                className={cn(
                  'overflow-hidden relative flex items-center justify-center',
                  displayMedia.length === 1 ? 'max-h-[500px]' : '',
                  displayMedia.length === 3 && i === 0 ? 'row-span-2' : '',
                )}
                style={{
                  background: 'var(--border)',
                  ...(displayMedia.length > 1 ? { aspectRatio: '1 / 1' } : { border: '1px solid var(--border)', borderRadius: '0.75rem' })
                }}
              >
                <img src={src} alt="" loading="lazy" className="w-full h-full object-cover transition-opacity duration-300" />
              </div>
            )
          })}
        </div>
      )}

      {audios.map((a: any) => (
        <audio
          key={a.mediaUrl}
          src={`${IK}/${a.mediaUrl}`}
          controls
          className="w-full h-9 rounded-lg"
          style={{ accentColor: 'var(--accent)' }}
        />
      ))}
    </div>
  )
}

// ── PostCard ──────────────────────────────────────────────────
export function PostCard({ post, currentUserId }: { post: Post, currentUserId?: string }) {
  const [liked, setLiked] = useState(false)
  const [localLikes, setLocalLikes] = useState(post.likes)
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()

  const author = post.primaryAuthor
  const isLong = (post.content?.length ?? 0) > 280

  // Optimistic like: flip immediately, reconcile with the server's authoritative
  // count on success, roll back to the snapshot on error.
  const likeMutation = useMutation({
    mutationFn: () => toggleLike({ data: { postId: post.postId } }),
    onMutate: () => {
      const snapshot = { liked, likes: localLikes }
      setLiked((v) => !v)
      setLocalLikes((n: number) => (liked ? Math.max(0, n - 1) : n + 1))
      return snapshot
    },
    onError: (_err, _vars, snapshot) => {
      if (snapshot) { setLiked(snapshot.liked); setLocalLikes(snapshot.likes) }
    },
    onSuccess: (res) => {
      if (res.ok) { setLiked(res.data.liked); setLocalLikes(res.data.likes) }
    },
  })

  function handleLike() {
    if (likeMutation.isPending) return
    likeMutation.mutate()
  }

  const deleteMutation = useMutation({
    mutationFn: () => deletePost({ data: { postId: post.postId } }),
    onSuccess: (res) => {
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      } else {
        alert(res.message)
      }
    },
    onError: (err) => {
      alert(err.message || 'Failed to delete post')
    }
  })

  function handleDelete() {
    if (deleteMutation.isPending) return
    if (window.confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
      deleteMutation.mutate()
    }
  }

  return (
    <article className="px-4 py-4 border-b transition-colors" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        {author ? <Avatar author={author} /> : (
          <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: 'var(--border)' }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-h)' }}>
                {author?.name ?? 'Unknown'}
              </span>
              {author?.profile?.isVerified && (
                <span style={{ color: 'var(--accent)' }}><IconVerified /></span>
              )}
              {post.postType === 'collab' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                  COLLAB
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-s)' }}>
                {formatRelativeTime(post.publishedAt)}
              </span>
              {currentUserId === author?.userId && (
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="text-xs flex items-center justify-center p-1.5 rounded-md hover:bg-red-500/10 text-red-500 transition-colors"
                  aria-label="Delete post"
                  title="Delete post"
                >
                  <IconTrash />
                </button>
              )}
            </div>
          </div>
          {author?.nickname && (
            <span className="text-xs" style={{ color: 'var(--text-s)' }}>@{author.nickname}</span>
          )}
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <div className="mt-3 ml-[52px]">
          <p className={cn('text-sm leading-relaxed whitespace-pre-wrap break-words', !expanded && isLong && 'line-clamp-4')} style={{ color: 'var(--text-h)' }}>
            {post.content}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)} className="mt-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="mt-2">
            <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--social-bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              {post.postCategory}
            </span>
          </div>
        </div>
      )}

      {/* Media */}
      {post.media.length > 0 && (
        <div className="ml-[52px]"><MediaGrid media={post.media} /></div>
      )}

      {/* Actions */}
      <div className="mt-3 ml-[52px] flex items-center gap-5">
        <button
          onClick={handleLike}
          aria-label={liked ? 'Unlike' : 'Like'}
          className={cn('flex items-center gap-1.5 text-xs font-medium transition-all rounded-lg px-2 py-1 -ml-2', liked ? 'scale-[1.05]' : 'opacity-60 hover:opacity-100')}
          style={{ color: liked ? 'var(--accent)' : 'var(--text)', background: liked ? 'var(--accent-bg)' : 'transparent' }}
        >
          <IconHeart filled={liked} />
          <span>{formatCount(localLikes)}</span>
        </button>

        <Link to="/post/$postId" params={{ postId: post.postId }} className="flex items-center gap-1.5 text-xs font-medium opacity-60 hover:opacity-100 transition-opacity px-2 py-1" style={{ color: 'var(--text)' }}>
          <IconComment />
          <span>{formatCount(post.comments)}</span>
        </Link>

        <div className="flex items-center gap-1.5 text-xs font-medium opacity-40" style={{ color: 'var(--text)' }}>
          <IconShare />
          <span>{formatCount(post.shares)}</span>
        </div>

        <div className="ml-auto flex items-center gap-1 text-xs opacity-40" style={{ color: 'var(--text)' }}>
          <IconEye />
          <span>{formatCount(post.views)}</span>
        </div>
      </div>
    </article>
  )
}
