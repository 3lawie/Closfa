// TikTok/YouTube-style search-click learning: when enough distinct people
// search a term and then open a specific post, that association gets
// merged straight into the post's own `keywords` — the post becomes
// findable for that term through the SAME full-text search path every
// other keyword source already uses (mergeKeywords, closfa_post_tsvector),
// rather than needing a separate click-log lookup bolted onto
// queries.post.search at query time. See searchClick in schema.ts for the
// raw event log this reads from.
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { mergeKeywords } from '@/lib/text/keywordMerge'
import { logger } from './logger'

// Starting guess, not tuned against real traffic — see plan's "Unresolved
// questions." Counts distinct signal SOURCES: each logged-in user counts
// once no matter how many times they click (dedup via user_id), each
// anonymous click counts as its own source (there's no persistent guest
// identity in this schema to dedupe against, so COALESCE(user_id, id)
// falls back to the always-unique row id for anonymous rows) — a single
// enthusiastic user repeatedly clicking their own result can't alone cross
// the threshold.
const CLICK_THRESHOLD = 3

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ')
}

/**
 * Fire-and-forget from the client after a search result is opened (see
 * PostModal.tsx) — logs the click, and if this exact (query, post) pair has
 * now crossed the threshold, merges the query's words into the post's
 * keywords so it's directly searchable for that term going forward. Never
 * throws — a failure here should never disrupt someone just opening a post.
 */
export async function logSearchClick(query: string, postId: string, userId: string | null): Promise<void> {
  const normalized = normalizeQuery(query)
  if (!normalized) return

  try {
    await db.insert(schema.searchClick).values({ query: normalized, postId, userId })

    const [{ distinctSources }] = await db
      .select({ distinctSources: sql<number>`count(distinct coalesce(${schema.searchClick.userId}, ${schema.searchClick.id}))` })
      .from(schema.searchClick)
      .where(sql`${schema.searchClick.query} = ${normalized} AND ${schema.searchClick.postId} = ${postId}`)

    logger.info('logSearchClick: recorded', { query: normalized, postId, distinctSources })

    if (distinctSources < CLICK_THRESHOLD) return

    const [post] = await db.select({ keywords: schema.post.keywords }).from(schema.post).where(eq(schema.post.postId, postId))
    if (!post) return

    const queryWords = normalized.split(/\s+/).filter(Boolean)
    const alreadyPresent = new Set((post.keywords ?? []).map((w) => w.toLowerCase()))
    const newWords = queryWords.filter((w) => !alreadyPresent.has(w.toLowerCase()))
    if (newWords.length === 0) return // every word from this query is already indexed for this post

    const keywords = mergeKeywords(post.keywords, queryWords)
    await db.update(schema.post).set({ keywords }).where(eq(schema.post.postId, postId))
    logger.info('logSearchClick: merged click-learned keywords', { query: normalized, postId, newWords })
  } catch (e) {
    logger.error('logSearchClick failed', { query: normalized, postId }, e instanceof Error ? e : undefined)
  }
}
