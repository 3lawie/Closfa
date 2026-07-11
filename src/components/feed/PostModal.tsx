import { useSearch, useNavigate, getRouteApi } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { PostCard } from '@/components/feed/PostCard'
import { CommentItem } from '@/components/feed/CommentItem'
import { getPostFn } from '@/server/actions/Database/services/post.service'
import { Button } from '@/components/ui/Button'
import type { Post } from '@/lib/entities/Post'

const routeApi = getRouteApi('__root__')

export function PostModal() {
  const search = routeApi.useSearch()
  const navigate = useNavigate()
  const postId = search.post

  const { data: post, isLoading } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => getPostFn({ data: { postId: postId! } }),
    enabled: !!postId,
  })

  const handleClose = () => {
    // Navigate without the post search param
    navigate({
      search: (prev) => ({ ...prev, post: undefined }),
      replace: true, // replace history so 'back' works cleanly
    })
  }

  return (
    <Modal isOpen={!!postId} onClose={handleClose}>
      {isLoading ? (
        <div className="p-16 flex justify-center">
          <span className="w-8 h-8 rounded-full border-4 border-current border-t-transparent animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : post ? (
        <div className="bg-white dark:bg-zinc-900 pb-8">
          <PostCard post={post as unknown as Post} />
          
          <div className="p-4 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--text-h)' }}>Comments ({post.comments})</h3>
            
            <div className="flex gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0" />
              <div className="flex-1 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Write a comment..." 
                  className="flex-1 text-sm px-4 py-2 rounded-full border bg-transparent outline-none focus:ring-1 focus:ring-opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface)' }}
                />
                <Button>
                  Post
                </Button>
              </div>
            </div>
            
            <div className="divide-y" style={{ divideColor: 'var(--border)' }}>
              {post.commentsList && post.commentsList.length > 0 ? (
                post.commentsList.map((comment: any) => (
                  <CommentItem key={comment.comment_id} comment={comment} />
                ))
              ) : (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--text-s)' }}>
                  No comments yet. Be the first to start the conversation!
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-16 flex flex-col items-center gap-2 px-8 text-center">
          <p className="font-semibold" style={{ color: 'var(--text-h)' }}>Post not found</p>
          <p className="text-sm" style={{ color: 'var(--text-s)' }}>
            It may have been removed or the link is incorrect.
          </p>
        </div>
      )}
    </Modal>
  )
}
