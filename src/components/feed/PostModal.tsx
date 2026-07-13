import { getRouteApi } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { PostCard } from '@/components/feed/PostCard'
import { CommentItem } from '@/components/feed/CommentItem'
import { CommentComposer } from '@/components/feed/CommentComposer'
import { getPostFn } from '@/server/actions/Database/services/post.service'
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

            {session && (
              <div className="mb-8">
                <CommentComposer postId={postId!} currentUserName={session.name} />
              </div>
            )}

            <div className="flex flex-col gap-6 divide-y divide-border border-opacity-50">
              {post.commentsList && post.commentsList.length > 0 ? (
                post.commentsList.map((comment: any) => (
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
