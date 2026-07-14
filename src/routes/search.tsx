import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { searchPostsFn } from '@/server/actions/Database/services/feed.service'
import { PostCard } from '@/components/feed/PostCard'
import type { Post } from '@/lib/entities/Post'
import { Search, Loader2, AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/search')({
  validateSearch: z.object({ q: z.string().optional() }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ deps, context }) => {
    if (!deps.q) return { session: context.session, initialResults: null }
    try {
      const initialResults = await searchPostsFn({ data: { query: deps.q } })
      return { session: context.session, initialResults }
    } catch (err) {
      // Logged, not swallowed — a broken search backend (e.g. a missing
      // Postgres function the query depends on) used to look identical to
      // "no matches" here, which made a real outage indistinguishable from
      // an empty result set. initialResults stays null either way; the
      // client-side query below re-fetches and surfaces its own error
      // state for the UI to branch on.
      console.error('[search] loader query failed:', err)
      return { session: context.session, initialResults: null }
    }
  },
  component: SearchPage,
})

function SearchPage() {
  const { session, initialResults } = Route.useLoaderData()
  const { q } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [input, setInput] = useState(q ?? '')

  const resultsQuery = useQuery({
    queryKey: ['search', q],
    queryFn: () => searchPostsFn({ data: { query: q! } }),
    initialData: initialResults ?? undefined,
    enabled: !!q,
    // A search backend failure (e.g. a missing DB function) is
    // deterministic, not transient — retrying just delays showing the user
    // what actually happened.
    retry: false,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed) navigate({ search: { q: trimmed } })
  }

  const results = resultsQuery.data ?? []

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 px-4 md:px-0">
      <header className="mb-8 pt-4 md:pt-8">
        <h1 className="text-3xl font-black tracking-tight text-text mb-2">Search</h1>
        <p className="text-text-s text-[15px] mb-6">
          Searches post text and, for video/audio posts, their transcript-derived keywords.
        </p>
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-s" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search posts…"
            className="w-full bg-surface border border-border rounded-[var(--r-pill)] pl-11 pr-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-accent-border transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
          />
        </form>
      </header>

      {resultsQuery.isFetching && !resultsQuery.data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      ) : resultsQuery.isError ? (
        // Distinct from "no matches" on purpose — a search backend failure
        // used to render the exact same empty state as zero results, which
        // made a real outage look like nothing simply matched the query.
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <AlertTriangle className="w-8 h-8 text-danger mb-2" />
          <p className="text-text-h text-xl font-bold">Search isn't working right now</p>
          <p className="text-text-s max-w-xs">
            {resultsQuery.error instanceof Error ? resultsQuery.error.message : 'Something went wrong. Please try again.'}
          </p>
        </div>
      ) : q && results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <p className="text-text-h text-xl font-bold">No results for "{q}"</p>
          <p className="text-text-s max-w-xs">Try a different word or phrase.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {results.map((post) => (
            <PostCard key={post.postId} post={post as unknown as Post} currentUserId={session?.userId} />
          ))}
        </div>
      )}
    </div>
  )
}
