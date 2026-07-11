import { useState } from 'react'
import { formatRelativeTime } from '@/lib/utils/format'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/Button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteComment } from '@/server/actions/Database/services/comment.service'

export function CommentItem({ comment, currentUserId }: { comment: any, currentUserId?: string }) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment({ data: { commentId: comment.comment_id } }),
    onSuccess: () => {
      // Re-fetch post query to get updated comments
      queryClient.invalidateQueries({ queryKey: ['post', comment.postId] })
    },
    onError: () => {
      alert('Failed to delete comment')
    }
  })

  if (deleteMutation.isSuccess) return null
  
  return (
    <div className="py-4 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gray-200 overflow-hidden">
          {comment.author?.profile?.avatarMedia ? (
            <img 
              src={`https://ik.imagekit.io/9npwwo7fb/tr:w-64,h-64,fo-face,c-at_max,f-avif/${comment.author.profile.avatarMedia.mediaUrl}`} 
              alt={comment.author.name} 
              className="w-full h-full object-cover" 
            />
          ) : (
             <div className="w-full h-full flex items-center justify-center text-xs text-gray-400" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
               {comment.author?.name?.charAt(0) || '?'}
             </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link to="/profile/$nickname" params={{ nickname: comment.author?.nickname || '' }} className="font-semibold text-sm hover:underline" style={{ color: 'var(--text-h)' }}>
              {comment.author?.name}
            </Link>
            <span className="text-xs" style={{ color: 'var(--text-s)' }}>
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          
          <p className="mt-1 text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
            {comment.comment}
          </p>
          
          {/* Actions */}
          <div className="mt-2 flex items-center gap-4 text-xs font-medium" style={{ color: 'var(--text-s)' }}>
            <button className="hover:opacity-100 opacity-70 transition-opacity flex items-center gap-1">
              Like {comment.comment_likes > 0 && `(${comment.comment_likes})`}
            </button>
            <button 
              onClick={() => setShowReplyForm(!showReplyForm)}
              className="hover:opacity-100 opacity-70 transition-opacity"
            >
              Reply
            </button>
            
            {currentUserId === comment.author?.userId && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  if (confirm('Delete this comment? This cannot be undone.')) {
                    deleteMutation.mutate()
                  }
                }}
                isPending={deleteMutation.isPending}
                className="hover:text-red-500 opacity-70 transition-colors ml-auto p-1 text-xs h-auto"
              >
                Delete
              </Button>
            )}
          </div>
          
          {showReplyForm && (
             <div className="mt-3 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Write a reply..." 
                  className="flex-1 text-sm px-3 py-1.5 rounded-full bg-transparent border outline-none focus:ring-1 focus:ring-opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface)' }}
                />
                <Button size="sm">
                  Reply
                </Button>
             </div>
          )}
          
          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-4 pl-4 border-l-2 space-y-4" style={{ borderColor: 'var(--border)' }}>
              {comment.replies.map((reply: any) => (
                <div key={reply.reply_id} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 bg-gray-200 overflow-hidden">
                    {reply.author?.profile?.avatarMedia ? (
                      <img 
                        src={`https://ik.imagekit.io/9npwwo7fb/tr:w-48,h-48,fo-face,c-at_max,f-avif/${reply.author.profile.avatarMedia.mediaUrl}`} 
                        alt={reply.author.name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                       <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                         {reply.author?.name?.charAt(0) || '?'}
                       </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link to="/profile/$nickname" params={{ nickname: reply.author?.nickname || '' }} className="font-semibold text-xs hover:underline" style={{ color: 'var(--text-h)' }}>
                        {reply.author?.name}
                      </Link>
                      <span className="text-[10px]" style={{ color: 'var(--text-s)' }}>
                        {formatRelativeTime(reply.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
                      {reply.comment}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
