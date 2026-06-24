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

import { db } from './db'

// Shorthand: cast a where-object to bypass broken beta type definitions
const w = (filter: Record<string, unknown>) => filter as any

// Shared `with` shape for feed queries — reused by getFeed + getFollowingFeed
const WITH_FEED_AUTHOR = {
  primaryAuthor: {
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
        with: { user: true },
      }),
  },

  // ── Post ────────────────────────────────────────────────────
  post: {
    /**
     * "For You" — algorithm feed.
     * Sorts by engagement (likes desc) then recency within the last 30 days.
     * Uses offset pagination so the sort order can be freely changed later.
     */
    getFeed: (limit = 15, page = 1) => {
      const offset = (page - 1) * limit
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      return db.query.post.findMany({
        where: w({
          is_published: true,
          published_at: { gt: thirtyDaysAgo }, // last 30 days
        }),
        orderBy: (p: any, { desc }: any) => [desc(p.likes), desc(p.published_at)],
        limit,
        offset,
        with: WITH_FEED_AUTHOR,
      })
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

      const posts = await db.query.post.findMany({
        where: w({
          is_published: true,
          author_id: { in: ids },
          // Use RAW for compound cursor logic — only applied when cursor exists.
          // Compound cursor: (date < cursorDate) OR (date = cursorDate AND id < cursorId)
          // Guarantees no posts are skipped even when timestamps are identical.
          ...(cursor ? {
            RAW: (p: any, { and, or, lt, gt, eq }: any) => {
              const [dateStr, idStr] = cursor.split('_')
              const cursorDate = new Date(dateStr)
              return direction === 'older'
                ? or(lt(p.published_at, cursorDate), and(eq(p.published_at, cursorDate), lt(p.postId, idStr)))
                : or(gt(p.published_at, cursorDate), and(eq(p.published_at, cursorDate), gt(p.postId, idStr)))
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

      return posts
    },

    getById: (postId: string) =>
      db.query.post.findFirst({
        where: w({ postId }),
        with: {
          primaryAuthor: { with: { profile: { with: { avatarMedia: true } } } },
          media: true,
          commentsList: true,
        },
      }),

    getByAuthor: (authorId: string) =>
      db.query.post.findMany({
        where: w({ author_id: authorId }),
        orderBy: { createdAt: 'desc' },
        with: WITH_FEED_AUTHOR,
      }),
  },

  // ── Comment ─────────────────────────────────────────────────
  comment: {
    getByPost: (postId: string) =>
      db.query.comment.findMany({
        where: w({ postId }),
        orderBy: { createdAt: 'desc' },
        with: { author: true, replies: true },
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
  },
}
