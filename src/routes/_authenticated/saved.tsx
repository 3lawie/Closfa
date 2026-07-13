import { createFileRoute } from '@tanstack/react-router'
import { getSavedPostsFn } from '@/server/actions/Database/services/savedPost.service'
import { PostCard } from '@/components/feed/PostCard'
import { motion } from 'framer-motion'
import { Bookmark } from 'lucide-react'

export const Route = createFileRoute('/_authenticated/saved')({
  loader: async ({ context }) => {
    const posts = await getSavedPostsFn().catch(() => [])
    return { session: context.session, posts }
  },
  component: SavedPostsPage,
})

function SavedPostsPage() {
  const { session, posts } = Route.useLoaderData()

  return (
    <div className="w-full max-w-2xl mx-auto pb-24">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-6"
      >
        <header className="px-2 md:px-0">
          <h1 className="text-3xl font-black tracking-tight text-text mb-2">Saved posts</h1>
          <p className="text-text-s">Posts you've bookmarked, most recent first.</p>
        </header>

        {posts.length > 0 ? (
          <div className="flex flex-col">
            {posts.map((post) => (
              <PostCard key={post.postId} post={post} currentUserId={session?.userId} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="w-16 h-16 rounded-lg bg-accent-bg text-accent flex items-center justify-center mb-6">
              <Bookmark className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-text mb-2">Nothing saved yet</p>
            <p className="text-text-s max-w-sm">
              Tap the bookmark icon on a post to save it here for later.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
