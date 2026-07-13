import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { createComment, createReply } from '@/server/actions/Database/services/comment.service'

interface CommentComposerProps {
  postId: string
  /** Present when this composer posts a reply instead of a top-level comment. */
  parentCommentId?: string
  currentUserName?: string
  placeholder?: string
  autoFocus?: boolean
  compact?: boolean
  onPosted?: () => void
}

// Shared by the standalone post page, the feed's post modal, and each
// comment's inline reply form — one place owns the create-comment /
// create-reply mutation and the post-detail query invalidation.
export function CommentComposer({
  postId,
  parentCommentId,
  currentUserName,
  placeholder,
  autoFocus,
  compact,
  onPosted,
}: CommentComposerProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    // Normalized to a shared shape — createComment/createReply return
    // differently-shaped success data (commentId vs replyId) that this
    // component never needs to read.
    mutationFn: async (): Promise<{ ok: boolean; message?: string }> => {
      const res = parentCommentId
        ? await createReply({ data: { parentCommentId, postId, comment: text.trim() } })
        : await createComment({ data: { postId, comment: text.trim() } })
      return res.ok ? { ok: true } : { ok: false, message: res.message }
    },
    onSuccess: (res) => {
      if (res.ok) {
        setText('')
        setError('')
        queryClient.invalidateQueries({ queryKey: ['post', postId] })
        onPosted?.()
      } else {
        setError(res.message ?? 'Failed to post')
      }
    },
    onError: () => setError('Failed to post — please try again'),
  })

  function handleSubmit() {
    if (!text.trim() || mutation.isPending) return
    mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-3">
        <div className={compact ? "w-8 h-8 rounded-full bg-accent-bg text-accent flex items-center justify-center font-bold text-xs shrink-0" : "w-10 h-10 rounded-full bg-accent-bg text-accent flex items-center justify-center font-bold text-sm shrink-0"}>
          {currentUserName?.charAt(0).toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
            }}
            placeholder={placeholder ?? (parentCommentId ? 'Write a reply...' : 'Write a comment...')}
            autoFocus={autoFocus}
            className="flex-1 bg-surface-translucent border border-border rounded-lg px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] text-text"
          />
          <Button
            size={compact ? 'sm' : 'md'}
            onClick={handleSubmit}
            isPending={mutation.isPending}
            disabled={!text.trim()}
          >
            {parentCommentId ? 'Reply' : 'Post'}
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-danger pl-[calc(2.5rem+0.75rem)]">{error}</p>}
    </div>
  )
}
