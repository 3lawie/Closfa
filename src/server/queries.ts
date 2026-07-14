// ──────────────────────────────────────────────────────────────
// Queries — ALL read-only DB queries in one file.
//
// Drizzle ORM v1.0.0-beta.23 — the relational query API's TypeScript
// definitions have an unresolved bug: because schema columns are typed
// as Column<any>, T in RelationsFieldFilter<T> resolves to `unknown`,
// which causes bare values and all nested operators ({ gt, lt, in ... })
// to be rejected by TS even though they are correct at runtime.
//
// The workaround is to cast `where` objects to `any` to bypass the
// broken beta type definitions, while keeping correct runtime values.
// ──────────────────────────────────────────────────────────────

import { sql } from 'drizzle-orm'
import { db } from './db'
import type { Post as PostShape } from '@/lib/entities/Post'
import { safeDisplayName } from '@/lib/utils/format'

// Shorthand: cast a where-object to bypass broken beta type definitions.
// Exported so services needing a one-off relational-object read (rather than
// a new queries.ts helper) use this single documented workaround instead of
// scattering ad hoc `as any` casts around the codebase.
export const w = (filter: Record<string, unknown>) => filter as any

// Every relational join in this file that pulls in a `user` row (author,
// actor, comment/reply author, ...) carries `name` straight from the auth
// provider — for some connections that IS the user's email address. Rather
// than patch every call site that renders a name, this walks a query result
// once and repairs any `{ name, nickname }`-shaped object in place before it
// ever leaves this file, so every consumer downstream is safe by construction.
function sanitizeAuthorNames<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeAuthorNames(v)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      if (key === 'name' && typeof obj.name === 'string' && 'nickname' in obj) {
        out.name = safeDisplayName(obj.name, obj.nickname as string | null)
      } else {
        out[key] = sanitizeAuthorNames(obj[key])
      }
    }
    return out as T
  }
  return value
}

async function getMutedKeywordsFor(userId: string): Promise<string[]> {
  const rows = await db.query.mutedKeyword.findMany({
    where: w({ userId }),
    columns: { keyword: true },
  }) as unknown as Array<{ keyword: string }>
  return rows.map((r) => r.keyword)
}

// Builds a RAW relational-filter callback (same mechanism getFollowingFeed's
// compound cursor already uses) that excludes posts whose content matches
// any muted keyword, case-insensitively.
function keywordExclusionRaw(keywords: string[]) {
  return (p: any, { and, or, isNull, notIlike }: any) => {
    const conditions = keywords.map((kw) => or(isNull(p.content), notIlike(p.content, `%${kw}%`)))
    return conditions.length > 1 ? and(...conditions) : conditions[0]
  }
}

// The same beta bug (see header) also corrupts the INFERRED RESULT type of
// findFirst/findMany whenever nested `with` relations are involved — it
// collapses to a loose `{ [x: string]: unknown }` union instead of a clean
// object, which then breaks every consumer that reads a nested field. Query
// helpers whose result crosses into components explicitly re-type their
// return with `as unknown as <Explicit>` below, mirroring how
// src/lib/entities/Post.ts already opts out of relying on inferred types
// for exactly this reason.
type ProfileWithAvatar = {
  profile_id: string
  bio: string | null
  website: string | null
  location: string | null
  isVerified: boolean
  hideEngagementCounts: boolean
  pinnedPostId: string | null
  avatarMedia: { mediaUrl: string } | null
}
type UserWithProfile = {
  userId: string
  name: string
  nickname: string | null
  profile: ProfileWithAvatar | null
}
type NotificationWithActor = {
  id: string
  userId: string
  actorId: string | null
  type: string
  entityId: string | null
  postId: string | null
  message: string | null
  read: boolean
  createdAt: Date | null
  actor: { userId: string; name: string; nickname: string | null; profile: ProfileWithAvatar | null } | null
}
type AdminPost = {
  postId: string
  content: string | null
  post_status: string
  author_id: string
  moderationReason: string | null
  scheduledPurgeAt: Date | null
  createdAt: Date | null
  updatedAt: Date | null
  primaryAuthor: { userId: string; name: string; nickname: string | null; profile: ProfileWithAvatar | null } | null
}
type OwnPost = {
  postId: string
  content: string | null
  post_status: string
  moderationReason: string | null
  scheduledPurgeAt: Date | null
  likes: number
  comments: number
  shares: number
  views: number
  createdAt: Date | null
  updatedAt: Date | null
  published_at: Date | null
  media: { media_id: string; mediaUrl: string; media_type: string; thumbnailUrl: string | null }[]
}

// Every relational fetch that joins a `user` row for display to OTHER users
// (feed authors, comment/reply authors, notification actors, moderator
// lists, public profiles) must restrict columns to this allowlist — without
// it, Drizzle returns every column including email/authProviderId/
// authProvider/emailVerified, which then gets serialized straight into the
// client-visible response even though no component ever renders it.
const PUBLIC_USER_COLUMNS = { userId: true, name: true, nickname: true } as const

// Shared `with` shape for feed queries — reused by getFeed + getFollowingFeed
const WITH_FEED_AUTHOR = {
  primaryAuthor: {
    columns: PUBLIC_USER_COLUMNS,
    with: {
      profile: { with: { avatarMedia: true as const } as const } as const,
    } as const,
  } as const,
  media: true as const,
} as const

export const queries = {
  // ── User ────────────────────────────────────────────────────
  user: {
    getById: (userId: string) =>
      db.query.user.findFirst({ where: w({ userId }) }),

    getByEmail: (email: string) =>
      db.query.user.findFirst({ where: w({ email }) }),

    getByAuthProviderId: (authId: string) =>
      db.query.user.findFirst({ where: w({ authProviderId: authId }) }),

    getWithProfile: (userId: string) =>
      db.query.user.findFirst({
        where: w({ userId }),
        with: { profile: { with: { avatarMedia: true } } },
      }),

    // Public profile lookup — viewable by any visitor, so columns are
    // restricted to what's safe to show a stranger (see PUBLIC_USER_COLUMNS).
    getByNickname: async (nickname: string) => {
      const user = await db.query.user.findFirst({
        where: w({ nickname }),
        columns: PUBLIC_USER_COLUMNS,
        with: { profile: { with: { avatarMedia: true } } },
      }) as unknown as UserWithProfile | undefined
      return user ? sanitizeAuthorNames(user) : user
    },

    getModeratorProfiles: (userId: string) =>
      db.query.profileMember.findMany({
        where: w({ userId }),
        with: { profile: true },
      }),
  },

  // ── Profile ─────────────────────────────────────────────────
  profile: {
    getByUserId: (userId: string) =>
      db.query.profile.findFirst({ where: w({ userId }) }),

    getModerators: (profileId: string) =>
      db.query.profileMember.findMany({
        where: w({ profileId }),
        with: { user: { columns: PUBLIC_USER_COLUMNS } },
      }),
  },

  // ── Follow ──────────────────────────────────────────────────
  follow: {
    getFollowers: (userId: string) =>
      db.query.follow.findMany({ where: w({ followedId: userId }) }),

    getFollowing: (userId: string) =>
      db.query.follow.findMany({ where: w({ followerId: userId }) }),
  },

  // ── Post ────────────────────────────────────────────────────
  post: {
    /**
     * "For You" — algorithm feed.
     * Sorts by engagement (likes desc) then recency within the last 30 days.
     *
     * DELIBERATELY offset-paginated (decision confirmed 2026-07-11): the sort
     * key `likes` mutates constantly, so a keyset cursor over it would skip
     * or duplicate posts whenever counts change mid-scroll — strictly worse
     * UX than offset drift. The Following feed, sorted on immutable
     * (published_at, postId), is where keyset pagination belongs. Backed by
     * the post_feed_rank_index (is_published, likes, published_at).
     */
    getFeed: async (limit = 15, page = 1, userId?: string) => {
      const offset = (page - 1) * limit
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const keywords = userId ? await getMutedKeywordsFor(userId) : []

      const posts = await db.query.post.findMany({
        where: w({
          is_published: true,
          published_at: { gt: thirtyDaysAgo }, // last 30 days
          ...(keywords.length > 0 ? { RAW: keywordExclusionRaw(keywords) } : {}),
        }),
        orderBy: (p: any, { desc }: any) => [desc(p.likes), desc(p.published_at)],
        limit,
        offset,
        with: WITH_FEED_AUTHOR,
      })
      return sanitizeAuthorNames(posts)
    },

    /**
     * "Following" — posts from users this person follows.
     * Uses a compound cursor (published_at_postId) to prevent skipped posts
     * when two posts share the same timestamp.
     * Supports bidirectional fetching (older = scroll down, newer = load new posts).
     * Two queries: (1) get followedIds, (2) filter posts by those IDs.
     */
    getFollowingFeed: async (userId: string, limit = 15, cursor?: string, direction: 'older' | 'newer' = 'older') => {
      const followed = await db.query.follow.findMany({
        where: w({ followerId: userId }),
        columns: { followedId: true },
      })

      if (!followed.length) return []

      const ids = followed.map((f) => f.followedId)
      const keywords = await getMutedKeywordsFor(userId)

      const posts = await db.query.post.findMany({
        where: w({
          is_published: true,
          author_id: { in: ids },
          // Use RAW for compound cursor logic and/or keyword muting — combined
          // into one callback since a filter object only allows one RAW key.
          // Cursor: (date < cursorDate) OR (date = cursorDate AND id < cursorId),
          // guaranteeing no posts are skipped even when timestamps are identical.
          ...((cursor || keywords.length > 0) ? {
            RAW: (p: any, { and, or, lt, gt, eq, isNull, notIlike }: any) => {
              const conditions: any[] = []
              if (cursor) {
                const [dateStr, idStr] = cursor.split('_')
                const cursorDate = new Date(dateStr)
                conditions.push(
                  direction === 'older'
                    ? or(lt(p.published_at, cursorDate), and(eq(p.published_at, cursorDate), lt(p.postId, idStr)))
                    : or(gt(p.published_at, cursorDate), and(eq(p.published_at, cursorDate), gt(p.postId, idStr)))
                )
              }
              for (const kw of keywords) {
                conditions.push(or(isNull(p.content), notIlike(p.content, `%${kw}%`)))
              }
              return conditions.length > 1 ? and(...conditions) : conditions[0]
            }
          } : {}),
        }),
        orderBy: w(direction === 'older'
          ? { published_at: 'desc', postId: 'desc' }
          : { published_at: 'asc', postId: 'asc' }),
        limit,
        with: WITH_FEED_AUTHOR,
      })

      // If fetching newer posts, we queried ASC so reverse back to DESC for the client
      if (direction === 'newer') posts.reverse()

      return sanitizeAuthorNames(posts)
    },

    // `includeRemoved` defaults to false so ordinary viewers (the post detail
    // route) never resolve a soft-deleted post; the delete/admin action path
    // passes true since it needs to find the post regardless of its current status.
    getById: async (postId: string, includeRemoved = false) => {
      const post = await db.query.post.findFirst({
        where: w(includeRemoved ? { postId } : { postId, post_status: { ne: 'removed' } }),
        with: {
          primaryAuthor: { columns: PUBLIC_USER_COLUMNS, with: { profile: { with: { avatarMedia: true } } } },
          media: true,
          commentsList: {
            orderBy: (c: any, { desc }: any) => [desc(c.createdAt)],
            with: {
              author: { columns: PUBLIC_USER_COLUMNS, with: { profile: { with: { avatarMedia: true } } } },
              replies: {
                orderBy: (r: any, { asc }: any) => [asc(r.createdAt)],
                with: { author: { columns: PUBLIC_USER_COLUMNS, with: { profile: { with: { avatarMedia: true } } } } }
              }
            }
          },
        },
      })
      return sanitizeAuthorNames(post)
    },

    getByAuthor: async (authorId: string) => {
      const posts = await db.query.post.findMany({
        where: w({ author_id: authorId, post_status: { ne: 'removed' } }),
        orderBy: { createdAt: 'desc' },
        with: WITH_FEED_AUTHOR,
      })
      return sanitizeAuthorNames(posts)
    },

    // Admin post-control view — every post regardless of status, newest
    // first. Deliberately separate from getByAuthor/getFeed (which both
    // exclude removed posts for ordinary viewers) since this is the one
    // place removed/draft/etc content is meant to still be visible.
    getAllForAdmin: async (limit = 50) => {
      const posts = await db.query.post.findMany({
        orderBy: { updatedAt: 'desc' },
        limit,
        with: WITH_FEED_AUTHOR,
      }) as unknown as AdminPost[]
      return sanitizeAuthorNames(posts)
    },

    // The personal "My Posts" control page — a user's own posts across
    // EVERY status (draft/pending/published/removed), unlike getByAuthor
    // which is for showing someone else's profile and hides removed posts.
    getOwnAllStatuses: (authorId: string, limit = 100) =>
      db.query.post.findMany({
        where: w({ author_id: authorId }),
        orderBy: { updatedAt: 'desc' },
        limit,
        columns: {
          postId: true, content: true, post_status: true, moderationReason: true, scheduledPurgeAt: true,
          likes: true, comments: true, shares: true, views: true,
          createdAt: true, updatedAt: true, published_at: true,
        },
        with: { media: { columns: { media_id: true, mediaUrl: true, media_type: true, thumbnailUrl: true } } },
      }) as unknown as Promise<OwnPost[]>,

    // Lightweight: just enough to count a user's posts (dashboard stats) —
    // skips the WITH_FEED_AUTHOR join getByAuthor pulls in for feed display.
    getIdsByAuthor: (authorId: string) =>
      db.query.post.findMany({
        where: w({ author_id: authorId }),
        columns: { postId: true },
      }),

    // Full-text search — content + AI/RAKE-extracted keywords (populated in
    // the background after publish, see postEnrichment.ts). Calls the same
    // closfa_post_tsvector() wrapper function schema.ts's postSearchIndex
    // indexes — using a bare to_tsvector(...) call here instead would still
    // work, but Postgres wouldn't recognize it as the same expression the
    // GIN index was built on, and would silently fall back to a full scan.
    // `RAW` is this file's existing escape hatch (see keywordExclusionRaw
    // above) for conditions the relational filter DSL's named operators
    // can't express — full-text match/rank need raw SQL functions, not
    // just comparison operators.
    search: async (searchQuery: string, limit = 20) => {
      const tsvectorExpr = sql`closfa_post_tsvector(post.content, post.keywords)`
      const posts = await db.query.post.findMany({
        where: w({
          is_published: true,
          RAW: () => sql`${tsvectorExpr} @@ plainto_tsquery('english', ${searchQuery})`,
        }),
        orderBy: () => [sql`ts_rank(${tsvectorExpr}, plainto_tsquery('english', ${searchQuery})) DESC`],
        limit,
        with: WITH_FEED_AUTHOR,
      })
      return sanitizeAuthorNames(posts)
    },

    // Dashboard "this week" reflection — neutral counts framed as a
    // reflection, not an engagement scoreboard: posts shared, likes given,
    // likes received, all scoped to the last 7 days.
    getWeeklyReflection: async (userId: string) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const [postsShared, likesGiven, myPosts] = await Promise.all([
        db.query.post.findMany({
          where: w({ author_id: userId, createdAt: { gte: sevenDaysAgo } }),
          columns: { postId: true },
        }),
        db.query.postLike.findMany({
          where: w({ userId, createdAt: { gte: sevenDaysAgo } }),
          columns: { id: true },
        }),
        db.query.post.findMany({
          where: w({ author_id: userId }),
          columns: { postId: true },
        }),
      ])

      const myPostIds = (myPosts as unknown as Array<{ postId: string }>).map((p) => p.postId)
      const likesReceived = myPostIds.length > 0
        ? await db.query.postLike.findMany({
            where: w({ postId: { in: myPostIds }, createdAt: { gte: sevenDaysAgo } }),
            columns: { id: true },
          })
        : []

      return {
        postsShared: postsShared.length,
        likesGiven: likesGiven.length,
        likesReceived: likesReceived.length,
      }
    },

    // Short "Liked by" list for a post's like count — mirrors the join shape
    // profile.getModerators already uses (postLike joined to public columns).
    getLikers: (postId: string, limit = 20) =>
      db.query.postLike.findMany({
        where: w({ postId }),
        orderBy: { createdAt: 'desc' },
        limit,
        with: { user: { columns: PUBLIC_USER_COLUMNS } },
      }),
  },

  // ── Comment ─────────────────────────────────────────────────
  comment: {
    getByPost: (postId: string) =>
      db.query.comment.findMany({
        where: w({ postId }),
        orderBy: { createdAt: 'desc' },
        with: { author: { columns: PUBLIC_USER_COLUMNS }, replies: true },
      }),
  },

  // ── Report ──────────────────────────────────────────────────
  report: {
    getPending: () =>
      db.query.report.findMany({
        where: w({ status: 'pending' }),
        orderBy: { createdAt: 'desc' },
      }),
  },

  // ── Notification ────────────────────────────────────────────
  notification: {
    getUnread: (userId: string) =>
      db.query.notification.findMany({
        where: w({ userId, read: false }),
        orderBy: { createdAt: 'desc' },
      }),

    getForUser: async (userId: string, limit = 50) => {
      const notifications = await db.query.notification.findMany({
        where: w({ userId }),
        orderBy: { createdAt: 'desc' },
        limit,
        with: { actor: { columns: PUBLIC_USER_COLUMNS, with: { profile: { with: { avatarMedia: true } } } } },
      }) as unknown as NotificationWithActor[]
      return sanitizeAuthorNames(notifications)
    },
  },

  // ── User Block ──────────────────────────────────────────────
  userBlock: {
    getBlockedByUser: async (userId: string) => {
      const rows = await db.query.userBlock.findMany({
        where: w({ blockerId: userId }),
        orderBy: { createdAt: 'desc' },
        with: { blocked: { columns: PUBLIC_USER_COLUMNS } },
      }) as unknown as Array<{ blocked: { userId: string; name: string; nickname: string | null } | null }>
      const blocked = rows.map((r) => r.blocked).filter((u): u is NonNullable<typeof u> => u !== null)
      return sanitizeAuthorNames(blocked)
    },
  },

  // ── Saved Post ──────────────────────────────────────────────
  savedPost: {
    getByUser: async (userId: string, limit = 50) => {
      // Same beta-bug cast as the rest of this file (see header) — the
      // relational result collapses to an unusable inferred type once a
      // nested `with` is involved. Re-typed as Post (the same shape every
      // other feed query hands to PostCard) rather than `unknown`, which
      // TanStack Start's serialization check rejects outright.
      const rows = await db.query.savedPost.findMany({
        where: w({ userId }),
        orderBy: { createdAt: 'desc' },
        limit,
        with: { post: { with: WITH_FEED_AUTHOR } },
      }) as unknown as Array<{ post: PostShape | null }>
      return rows.map((r) => r.post).filter((p): p is PostShape => p !== null)
    },
  },
}
