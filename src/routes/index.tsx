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
import { getSession } from '@/server/lib/session'
import { getFeedFn } from "../server/actions/Database/services/feed.service"
import { Navbar } from '@/components/layout/Navbar'
import { FeedList } from '@/components/feed/FeedList'

export const Route = createFileRoute('/')(({
  loader: async () => {
    const [result, firstPage] = await Promise.all([
      getSession(),
      // Pre-fetch first page of the public "For You" feed
      getFeedFn({ data: { limit: 15 } }).catch(() => null),
    ])
    return { session: result.session, firstPage }
  },
  component: HomePage,
}))

function HomePage() {
  const { session, firstPage } = Route.useLoaderData()

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)' }}
    >
      <Navbar session={session} />

      {/* Feed column — centered, max 680px, matches Navbar width */}
      <main className="max-w-[680px] mx-auto" style={{ borderInline: '1px solid var(--border)' }}>
        <FeedList
          session={session as any}
          initialFeedPage={firstPage as any}
        />
      </main>
    </div>
  )
}
