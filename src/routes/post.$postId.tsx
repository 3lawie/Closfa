import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getPostFn } from '@/server/actions/Database/services/post.service'
import { PostCard } from '@/components/feed/PostCard'
import { CommentItem } from '@/components/feed/CommentItem'
import { CommentComposer } from '@/components/feed/CommentComposer'
import type { Post } from '@/lib/entities/Post'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/post/$postId')({
  loader: async ({ params, context }) => {
    // Session comes from root-route context (decrypted once per navigation).
    const post = await getPostFn({ data: { postId: params.postId } }).catch(() => null)
    return { session: context.session, post }
  },
  component: PostDetailPage,
})

function PostDetailPage() {
  const { session, post: initialPost } = Route.useLoaderData()
  const params = Route.useParams()

  // Same query key/shape as PostModal — posting a comment/reply just
  // invalidates ['post', postId] and both surfaces pick it up.
  const { data: post } = useQuery({
    queryKey: ['post', params.postId],
    queryFn: () => getPostFn({ data: { postId: params.postId } }),
    initialData: initialPost,
  })

  return (
    <div className="min-h-screen bg-bg text-text">
      <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-8">
        <div className="flex items-center">
          <Link
            to="/"
            className="text-accent hover:text-accent-hover transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to feed
          </Link>
        </div>

        {post ? (
          <div className="flex flex-col gap-8">
            <PostCard post={post as unknown as Post}/>

            <div className="flex flex-col gap-6">
              <h3 className="text-text-h text-xl font-semibold">
                Comments ({post.comments})
              </h3>

              {session && (
                <CommentComposer postId={params.postId} currentUserName={session.name} />
              )}

              <div className="flex flex-col gap-4">
                {post.commentsList && post.commentsList.length > 0 ? (
                  post.commentsList.map((comment: any) => (
                    <CommentItem
                      key={comment.comment_id}
                      comment={comment}
                      currentUserId={session?.userId}
                      currentUserName={session?.name}
                    />
                  ))
                ) : (
                  <div className="text-text-s py-8 text-center italic opacity-80">
                    No comments yet. Be the first to start the conversation!
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <p className="text-text-h text-xl font-bold">Post not found</p>
            <p className="text-text-s max-w-xs">
              It may have been removed or the link is incorrect.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
