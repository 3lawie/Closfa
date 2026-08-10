import { useEffect, useRef, useState } from 'react'
import { formatRelativeTime } from '@/lib/utils/format'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteComment, deleteReply, toggleCommentLike, toggleReplyLike } from '@/server/actions/Database/services/comment.service'
import { CommentComposer } from './CommentComposer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clientEnv } from '@/lib/env/client-env'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { useOptimisticLike } from '@/lib/hooks/useOptimisticLike'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Trash2 } from 'lucide-react'

interface CommentAuthor {
  userId: string
  name: string
  nickname: string | null
  profile?: { avatarMedia?: { mediaUrl: string } | null } | null
}

interface CommentReply {
  reply_id: string
  comment: string
  createdAt: Date | string | null
  comment_likes: number
  author?: CommentAuthor | null
  user_id: string
}

export interface CommentData {
  comment_id: string
  comment: string
  createdAt: Date | string | null
  comment_likes: number
  postId: string
  userId: string
  author?: CommentAuthor | null
  replies?: CommentReply[]
}

function Avatar({ author, size }: { author?: CommentAuthor | null, size: 'sm' | 'md' }) {
  const dims = size === 'md' ? 'w-10 h-10' : 'w-8 h-8'
  const transform = size === 'md' ? 'tr:w-64,h-64,fo-face,c-at_max,f-avif' : 'tr:w-48,h-48,fo-face,c-at_max,f-avif'
  const avatarUrl = author?.profile?.avatarMedia?.mediaUrl

  if (avatarUrl) {
    return (
      <img
        src={`${clientEnv.imagekitUrlEndpoint}/${transform}/${avatarUrl}`}
        alt={author?.name}
        className={`${dims} rounded-full object-cover shadow-sm shrink-0`}
      />
    )
  }
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-bold ${size === 'md' ? 'text-sm' : 'text-xs'} bg-accent-bg text-accent shadow-sm shrink-0`}>
      {author?.name?.charAt(0) || '?'}
    </div>
  )
}

export function CommentItem({ comment, currentUserId, currentUserName }: { comment: CommentData, currentUserId?: string, currentUserName?: string }) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [pendingReplyDeleteId, setPendingReplyDeleteId] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replyDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()

  const { liked, likes: localLikes, toggle: toggleLike } = useOptimisticLike(
    () => toggleCommentLike({ data: { commentId: comment.comment_id } }),
    comment.comment_likes,
  )

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment({ data: { commentId: comment.comment_id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', comment.postId] })
    },
    onError: () => {
      // The real delete only fires after the undo window elapses — on
      // failure the comment needs to reappear, not stay hidden forever.
      setPendingDelete(false)
      toast('Failed to delete comment', { variant: 'danger' })
    }
  })

  const deleteReplyMutation = useMutation({
    mutationFn: (replyId: string) => deleteReply({ data: { replyId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', comment.postId] })
    },
    onError: () => {
      setPendingReplyDeleteId(null)
      toast('Failed to delete reply', { variant: 'danger' })
    }
  })

  // The pending deletes are fire-and-forget by design — navigating away during
  // the undo window still deletes, which is what "deleted, unless you undo"
  // means. This only stops the timers from outliving the component.
  useEffect(() => () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    if (replyDeleteTimerRef.current) clearTimeout(replyDeleteTimerRef.current)
  }, [])

  function handleConfirmDelete() {
    setShowDeleteConfirm(false)
    setPendingDelete(true)
    toast('Comment deleted.', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
          deleteTimerRef.current = null
          setPendingDelete(false)
        },
      },
    })
    deleteTimerRef.current = setTimeout(() => deleteMutation.mutate(), 5000)
  }

  function handleConfirmReplyDelete() {
    const replyId = deletingReplyId
    if (!replyId) return
    setDeletingReplyId(null)
    setPendingReplyDeleteId(replyId)
    toast('Reply deleted.', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (replyDeleteTimerRef.current) clearTimeout(replyDeleteTimerRef.current)
          replyDeleteTimerRef.current = null
          setPendingReplyDeleteId(null)
        },
      },
    })
    replyDeleteTimerRef.current = setTimeout(() => deleteReplyMutation.mutate(replyId), 5000)
  }

  if (pendingDelete) return null

  // A reply awaiting its undo window is hidden optimistically, the same way
  // `pendingDelete` hides the whole comment — without this the row stays on
  // screen for five seconds after the user confirmed deleting it.
  const replies = (comment.replies ?? []).filter((r) => r.reply_id !== pendingReplyDeleteId)

  return (
    <div id={`comment-${comment.comment_id}`} className="group">
      <div className="flex items-start gap-4">
        <Link to="/profile/$nickname" params={{ nickname: comment.author?.nickname || '' }} className="shrink-0">
          <Avatar author={comment.author} size="md" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/profile/$nickname"
              params={{ nickname: comment.author?.nickname || '' }}
              className="font-bold text-[15px] text-text hover:text-brand transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            >
              {comment.author?.name}
            </Link>
            <span className="text-xs text-text-s">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>

          <p className="text-[15px] text-text leading-relaxed mb-2 whitespace-pre-wrap">
            {comment.comment}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 text-xs font-semibold text-text-s mb-2">
            <button
              onClick={() => currentUserId && toggleLike()}
              disabled={!currentUserId}
              className={cn(
                "flex items-center gap-1 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                liked ? "text-brand" : "hover:text-brand disabled:hover:text-text-s"
              )}
            >
              <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
              Like {localLikes > 0 && `(${localLikes})`}
            </button>
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm((v) => !v)}
                className="flex items-center gap-1 hover:text-brand transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                <MessageCircle size={14} />
                Reply
              </button>
            )}
            {replies.length > 0 && (
              <button
                onClick={() => setShowReplies((v) => !v)}
                className="hover:text-brand transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              >
                {showReplies ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}

            {currentUserId === comment.author?.userId && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 hover:text-danger transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>

          <AnimatePresence>
            {showReplyForm && (
              <motion.div
                initial={{ opacity: 0, y: -5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 mb-4"
              >
                <CommentComposer
                  postId={comment.postId}
                  parentCommentId={comment.comment_id}
                  currentUserName={currentUserName}
                  autoFocus
                  compact
                  onPosted={() => setShowReplyForm(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Replies — SVG thread line runs from the parent's avatar down
              through the trunk, with a small curved branch peeling off to
              each reply's avatar. The trunk is a plain div (its height is
              just "top to bottom of the list"); each branch is its own tiny
              SVG so row height (wrapped text, etc.) never has to be measured. */}
          {showReplies && replies.length > 0 && (
            <div className="relative mt-1">
              <div className="absolute left-5 top-0 bottom-4 w-px bg-border" aria-hidden="true" />
              <div className="flex flex-col gap-4">
                {replies.map((reply) => (
                  <ReplyRow
                    key={reply.reply_id}
                    reply={reply}
                    currentUserId={currentUserId}
                    onDelete={() => setDeletingReplyId(reply.reply_id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete this comment?"
        description="Its replies will be deleted too. You'll have a few seconds to undo."
        confirmLabel="Delete comment"
        isPending={deleteMutation.isPending}
      />
      <ConfirmDialog
        isOpen={deletingReplyId !== null}
        onClose={() => setDeletingReplyId(null)}
        onConfirm={handleConfirmReplyDelete}
        title="Delete this reply?"
        description="You'll have a few seconds to undo."
        confirmLabel="Delete reply"
        isPending={deleteReplyMutation.isPending}
      />
    </div>
  )
}

// Owns its own like state — each reply toggles independently rather than
// CommentItem tracking a like/count map for every reply in the thread.
function ReplyRow({ reply, currentUserId, onDelete }: { reply: CommentReply, currentUserId?: string, onDelete: () => void }) {
  const { liked, likes: localLikes, toggle: toggleLike } = useOptimisticLike(
    () => toggleReplyLike({ data: { replyId: reply.reply_id } }),
    reply.comment_likes,
  )

  return (
    <div id={`comment-${reply.reply_id}`} className="relative flex items-start gap-3 group/reply">
      <svg
        width="24" height="24" viewBox="0 0 24 24"
        className="absolute left-0 top-0 pointer-events-none"
        aria-hidden="true"
      >
        <path d="M 20 0 V 12 Q 20 16 24 16" fill="none" stroke="var(--border)" strokeWidth="1.5" />
      </svg>
      <Link to="/profile/$nickname" params={{ nickname: reply.author?.nickname || '' }} className="shrink-0 ml-8">
        <Avatar author={reply.author} size="sm" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Link
            to="/profile/$nickname"
            params={{ nickname: reply.author?.nickname || '' }}
            className="font-bold text-sm text-text hover:text-brand transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          >
            {reply.author?.name}
          </Link>
          <span className="text-[11px] text-text-s">
            {formatRelativeTime(reply.createdAt)}
          </span>
        </div>
        <p className="text-sm text-text leading-relaxed whitespace-pre-wrap mb-1">
          {reply.comment}
        </p>
        <button
          onClick={() => currentUserId && toggleLike()}
          disabled={!currentUserId}
          className={cn(
            "flex items-center gap-1 text-xs font-semibold transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
            liked ? "text-brand" : "text-text-s hover:text-brand disabled:hover:text-text-s"
          )}
        >
          <Heart size={12} fill={liked ? 'currentColor' : 'none'} />
          Like {localLikes > 0 && `(${localLikes})`}
        </button>
      </div>
      {currentUserId === reply.author?.userId && (
        <button
          onClick={onDelete}
          className="text-text-s hover:text-danger transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] opacity-0 group-hover/reply:opacity-100 shrink-0"
          title="Delete reply"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
