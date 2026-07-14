import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { searchPostsFn } from '@/server/actions/Database/services/feed.service'
import { PostCard } from '@/components/feed/PostCard'
import type { Post } from '@/lib/entities/Post'
import { Search, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/search')({
  validateSearch: z.object({ q: z.string().optional() }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ deps, context }) => {
    const initialResults = deps.q ? await searchPostsFn({ data: { query: deps.q } }).catch(() => null) : null
    return { session: context.session, initialResults }
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
