import { createFileRoute, Link } from '@tanstack/react-router'
import { getPostFn } from '@/server/actions/Database/services/post.service'
import { Navbar } from '@/components/layout/Navbar'
import { PostCard } from '@/components/feed/PostCard'
import type { Post } from '@/lib/entities/Post'

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
          <PostCard post={post as unknown as Post} />
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
