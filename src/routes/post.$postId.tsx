import { createFileRoute, Link } from '@tanstack/react-router'
import { getPostFn } from '@/server/actions/Database/services/post.service'
import { Navbar } from '@/components/layout/Navbar'
import { PostCard } from '@/components/feed/PostCard'
import type { Post } from '@/lib/entities/Post'
import { CommentItem } from '@/components/feed/CommentItem'

export const Route = createFileRoute('/post/$postId')({
  loader: async ({ params, context }) => {
    // Session comes from root-route context (decrypted once per navigation).
    const post = await getPostFn({ data: { postId: params.postId } }).catch(() => null)
    return { session: context.session, post }
  },
  component: PostDetailPage,
})

function PostDetailPage() {
  const { session, post } = Route.useLoaderData()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar session={session} />

      <main className="max-w-[680px] mx-auto" style={{ borderInline: '1px solid var(--border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <Link to="/" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            ← Back to feed
          </Link>
        </div>

        {post ? (
          <>
            <PostCard post={post as unknown as Post} />
            
            <div className="p-4 bg-white dark:bg-zinc-900 mt-2">
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
                  <button className="px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                    Post
                  </button>
                </div>
              </div>
              
              <div className="divide-y" style={{ divideColor: 'var(--border)' }}>
                {post.commentsList && post.commentsList.length > 0 ? (
                  post.commentsList.map((comment: any) => (
                    <CommentItem key={comment.comment_id} comment={comment} currentUserId={session?.userId} />
                  ))
                ) : (
                  <div className="py-8 text-center text-sm" style={{ color: 'var(--text-s)' }}>
                    No comments yet. Be the first to start the conversation!
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="py-16 flex flex-col items-center gap-2 px-8 text-center">
            <p className="font-semibold" style={{ color: 'var(--text-h)' }}>Post not found</p>
            <p className="text-sm" style={{ color: 'var(--text-s)' }}>
              It may have been removed or the link is incorrect.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
