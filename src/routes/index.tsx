// ──────────────────────────────────────────────────────────────
// Home — feed page
//
// Loader (runs on server during SSR):
//   1. Gets the session (from encrypted cookie)
//   2. Fetches the first page of the "For You" feed from DB
//
// Both calls run in parallel (Promise.all) to avoid waterfall.
// The first feed page arrives pre-rendered in the HTML —
// no loading state for the initial content on any device.
//
// Subsequent pages are fetched client-side via useInfiniteQuery
// inside FeedList, seeded with the loader's initialFeedPage.
// ──────────────────────────────────────────────────────────────

import { createFileRoute } from '@tanstack/react-router'
import { getFeedFn } from "../server/actions/Database/services/feed.service"
import { FeedList } from '@/components/feed/FeedList'
import { Button } from '@/components/ui/Button'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')(({
  loader: async ({ context }) => {
    // Session comes from root-route context (decrypted once per navigation);
    // the loader only pre-fetches the first page of the public "For You" feed.
    const firstPage = await getFeedFn({ data: { limit: 15 } }).catch(() => null)
    return { session: context.session, firstPage }
  },
  component: HomePage,
}))

function HomePage() {
  const { session, firstPage } = Route.useLoaderData()

  return (
    <div className="min-h-screen p-6 sm:p-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Feed Column */}
        <main className="lg:col-span-2 flex flex-col gap-6">
          <header className="flex flex-col gap-1 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--text-h)' }}>Home Feed</h1>
            <p className="text-sm" style={{ color: 'var(--text-s)' }}>Stay up to date with updates around the platform.</p>
          </header>
          
          <div className="rounded-2xl border overflow-hidden shadow-sm" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <FeedList
              session={session}
              initialFeedPage={firstPage}
            />
          </div>
        </main>

        {/* Sidebar Info/Widgets Column */}
        <aside className="hidden lg:flex flex-col gap-6 lg:col-span-1">
          {session ? (
            <div className="p-6 rounded-2xl border shadow-sm flex flex-col gap-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-h)' }}>Welcome back!</h2>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Share your thoughts, upload media files, and discover what others are sharing.
              </p>
              <Link to="/create">
                <Button className="w-full">+ New Post</Button>
              </Link>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border shadow-sm flex flex-col gap-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-h)' }}>Join Closfa</h2>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Create an account to follow other users, comment on posts, and publish your own updates.
              </p>
              <a href="/api/auth/login">
                <Button className="w-full">Log In</Button>
              </a>
            </div>
          )}

          <div className="p-6 rounded-2xl border shadow-sm flex flex-col gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-s)' }}>Platform Guidelines</h3>
            <ul className="text-xs space-y-2" style={{ color: 'var(--text)' }}>
              <li>• Be respectful and constructive.</li>
              <li>• Do not post copyrighted media without permissions.</li>
              <li>• Report content that violates guidelines.</li>
            </ul>
          </div>
        </aside>

      </div>
    </div>
  )
}
