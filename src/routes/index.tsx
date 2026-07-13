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
import { motion } from 'framer-motion'
import { Heart, MessageCircle, Share2, Bookmark, Keyboard } from 'lucide-react'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    // Session comes from root-route context (decrypted once per navigation);
    // the loader only pre-fetches the first page of the public "For You" feed.
    const firstPage = await getFeedFn({ data: { limit: 15 } }).catch(() => null)
    return { session: context.session, firstPage }
  },
  component: HomePage,
})

function HomePage() {
  const { session, firstPage } = Route.useLoaderData()

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-8 lg:gap-12 pb-24 px-4 md:px-0">
      {/* Main Feed Column */}
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex-1 min-w-0"
      >
        <header className="mb-8 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-text mb-2">Home Feed</h1>
              <p className="text-text-s text-[15px]">Stay up to date with updates around the platform.</p>
            </div>
          </div>
        </header>

        <div className="bg-transparent">
          <FeedList
            session={session}
            initialFeedPage={firstPage}
          />
        </div>
      </motion.main>

      {/* Sidebar Info/Widgets Column — sticky so "New Post" and the rest
          stay reachable without following the feed's own scroll, but it
          lives in its own column (not fixed/overlapping) so it never sits
          on top of feed content the way a floating button would. */}
      <motion.aside
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="hidden lg:flex w-80 flex-col gap-6 sticky top-24 self-start"
      >
        {session ? (
          <div className="bg-surface rounded-lg p-6 shadow-sm border border-border">
            <h2 className="text-lg font-bold text-text mb-2">Welcome back!</h2>
            <p className="text-text-s leading-relaxed mb-6">
              Share your thoughts, upload media files, and discover what others are sharing.
            </p>
            <Link to="/create">
              <Button className="w-full py-6 font-semibold">
                + New Post
              </Button>
            </Link>
          </div>
        ) : (
          <div className="bg-surface rounded-lg p-6 shadow-sm border border-border">
            <h2 className="text-lg font-bold text-text mb-2">Join Closfa</h2>
            <p className="text-text-s leading-relaxed mb-6">
              Create an account to follow other users, comment on posts, and publish your own updates.
            </p>
            <a href="/api/auth/login">
              <Button className="w-full py-6 font-semibold">
                Log In
              </Button>
            </a>
          </div>
        )}

        {/* Interactions — deliberately NOT a card: no background, no border,
            smaller/muted text and lower-opacity icons. Refactoring UI's
            de-emphasis toolkit (size, weight, color — not a box) so this
            reads as reference material, not a competing panel next to
            "Welcome back" and "Platform Guidelines". */}
        {session && (
          <div className="hidden lg:flex flex-col gap-2.5 px-1">
            <h3 className="text-[11px] font-semibold text-text-s/70 uppercase tracking-wider flex items-center gap-1.5">
              <Keyboard className="w-3 h-3" />
              Keyboard shortcuts
            </h3>
            <ul className="flex flex-col gap-1.5 text-xs text-text-s">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Heart className="w-3.5 h-3.5 opacity-60 shrink-0" /> Like</span>
                <kbd className="font-mono text-[10px] font-bold text-text-s bg-bg border border-border rounded px-1.5 py-0.5">L / K</kbd>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5 opacity-60 shrink-0" /> Comment</span>
                <kbd className="font-mono text-[10px] font-bold text-text-s bg-bg border border-border rounded px-1.5 py-0.5">C</kbd>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Share2 className="w-3.5 h-3.5 opacity-60 shrink-0" /> Share</span>
                <kbd className="font-mono text-[10px] font-bold text-text-s bg-bg border border-border rounded px-1.5 py-0.5">S</kbd>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Bookmark className="w-3.5 h-3.5 opacity-60 shrink-0" /> Save</span>
                <kbd className="font-mono text-[10px] font-bold text-text-s bg-bg border border-border rounded px-1.5 py-0.5">Shift+S</kbd>
              </li>
            </ul>
            <p className="text-[11px] text-text-s/60 pt-0.5">
              Only the focused post responds (↑/↓ to move focus) — Shift + / for the full list.
            </p>
          </div>
        )}

        <div className="bg-surface-translucent rounded-lg p-6 border border-border">
          <h3 className="text-xs font-bold text-text mb-4 uppercase tracking-wider">Platform Guidelines</h3>
          <ul className="text-sm text-text-h space-y-3 leading-relaxed">
            <li className="flex gap-2">
              <span className="text-accent">•</span>
              <span>Be respectful and constructive.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent">•</span>
              <span>Do not post copyrighted media without permissions.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent">•</span>
              <span>Report content that violates guidelines.</span>
            </li>
          </ul>
        </div>
      </motion.aside>
    </div>
  )
}
