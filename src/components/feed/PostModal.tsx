import { getRouteApi, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { PostCard } from '@/components/feed/PostCard'
import { CommentItem, type CommentData } from '@/components/feed/CommentItem'
import { CommentComposer } from '@/components/feed/CommentComposer'
import { getPostFn, recordPostViewFn } from '@/server/actions/Database/services/post.service'
import { logSearchClickFn } from '@/server/actions/Database/services/feed.service'
import type { Post } from '@/lib/entities/Post'
import { motion } from 'framer-motion'
import { Loader2, MessageSquare } from 'lucide-react'

const routeApi = getRouteApi('__root__')

export function PostModal() {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const { session } = routeApi.useRouteContext()
  const postId = search.post

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPostFn({ data: { postId: postId! } }),
    enabled: !!postId,
  })

  // One record per opened postId, not per re-render — mirrors post.$postId.tsx.
  useEffect(() => {
    if (postId) recordPostViewFn({ data: { postId } })

  }, [postId])

  // Search-click learning (see searchClickLearning.ts) — PostModal is the
  // single component every "open a post" path already funnels through
  // (comment-icon link, the `C` keyboard shortcut, a direct /post/$postId
  // visit, etc.), so this one hook covers all of them without touching
  // PostCard.tsx at all. `location` here is the router's raw current
  // location, not this modal's own root-level search schema — `/search`'s
  // `q` param belongs to a different route, so it has to be read this way
  // rather than through routeApi.useSearch() above.
  //
  // Deliberately keyed on the `q` param's presence, NOT `location.pathname
  // === '/search'` — the comment-icon Link that opens a post from search
  // results (PostCard.tsx) is a root-scoped Link with no explicit `to`, so
  // clicking it resolves against the ROOT's own path and navigates to `/`
  // (keeping `q` in the URL) before this component ever mounts. By the time
  // this effect runs, the pathname has already changed; `q`'s presence is
  // the only signal that survives that navigation.
  // Selected down to the primitive `q` string itself, not the `location`
  // object — useRouterState re-runs `select` (and can hand back a new
  // `location` object reference with identical field values) on every
  // router state change, not just when `q` actually changes. Depending on
  // that object directly re-fired this effect several times for a single
  // click (confirmed live: one click logged 3 rows), which let a single
  // click blow straight through the click-learning threshold instead of
  // requiring genuinely repeated clicks. A string primitive compares by
  // value, so the effect now only re-runs when `q` itself actually changes.
  const searchQ = useRouterState({ select: (s) => (s.location.search as { q?: string }).q })
  useEffect(() => {
    if (!postId || !searchQ) return
    logSearchClickFn({ data: { query: searchQ, postId } })
  }, [postId, searchQ])

  // Deep-link from a comment/reply notification — same scroll+highlight
  // treatment as post.$postId.tsx.
  const commentId = search.commentId
  useEffect(() => {
    if (!commentId || !post) return
    const el = document.getElementById(`comment-${commentId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('bg-accent-bg/40', 'rounded-lg')
    const timer = setTimeout(() => el.classList.remove('bg-accent-bg/40', 'rounded-lg'), 2500)
    return () => clearTimeout(timer)
  }, [commentId, post])

  const handleClose = () => {
    // Navigate without the post search param
    navigate({
      search: (prev) => ({ ...prev, post: undefined }),
      replace: true, // replace history so 'back' works cleanly
    })
  }

  return (
    // backToClose={false}: this modal already owns a real history entry (the
    // `?post=` search param), so Back closes it via the router. Letting Modal
    // push its own sentinel on top would mean the first Back pops the sentinel,
    // handleClose fires a replace:true navigation that swallows the `?post=`
    // entry, and the user needs a second, apparently dead, Back press.
    <Modal isOpen={!!postId} onClose={handleClose} backToClose={false}>
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : post ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-6"
        >
          {/* Re-using PostCard directly inside the modal gives a unified look */}
          <div className="bg-transparent -mx-6 -mt-6">
            <PostCard post={post as unknown as Post}/>
          </div>

          <div className="mt-4 pt-6 border-t border-border">
            <h3 className="text-lg font-bold text-text mb-6 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-text-s" />
              Comments ({post.comments})
            </h3>

            {session ? (
              <div className="mb-8">
                <CommentComposer postId={postId!} currentUserName={session.name} />
              </div>
            ) : (
              <a
                href="/api/auth/login"
                className="mb-8 flex items-center gap-3 p-4 rounded-lg border border-accent-border bg-accent-bg/50 hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] group"
              >
                <div className="w-9 h-9 rounded-full bg-accent-bg flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-h">Join the conversation</p>
                  <p className="text-xs text-text-s">Log in to comment and reply to this post.</p>
                </div>
                <span className="text-xs font-semibold text-accent group-hover:underline shrink-0">Log in →</span>
              </a>
            )}

            <div className="flex flex-col gap-6 divide-y divide-border border-opacity-50">
              {post.commentsList && post.commentsList.length > 0 ? (
                (post.commentsList as unknown as CommentData[]).map((comment) => (
                  <div className="pt-6 first:pt-0" key={comment.comment_id}>
                    <CommentItem comment={comment} currentUserId={session?.userId} currentUserName={session?.name} />
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-text-s">
                  <p className="font-medium text-text">No comments yet.</p>
                  <p className="text-sm">Be the first to start the conversation!</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-xl font-bold text-text mb-2">Post not found</p>
          <p className="text-text-s">
            It may have been removed or the link is incorrect.
          </p>
        </div>
      )}
    </Modal>
  )
}
