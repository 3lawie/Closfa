// ──────────────────────────────────────────────────────────────
// Queries — ALL read-only DB queries in one file.
//
// Uses Drizzle v1 beta object-filter syntax for `where`.
// Cursor pagination uses nested operator syntax:
//   { published_at: { lt: new Date(cursor) } }
// rather than the callback form which is a v0.x pattern.
// ──────────────────────────────────────────────────────────────

import { db } from './db'

// Shared `with` shape for feed queries — reused by getFeed + getFollowingFeed
const WITH_FEED_AUTHOR = {
  primaryAuthor: {
    with: {
      profile: { with: { avatar: true as const } as const } as const,
    } as const,
  } as const,
  media: true as const,
} as const

export const queries = {
  // ── User ────────────────────────────────────────────────────
  user: {
    getById: (userId: string) =>
      db.query.user.findFirst({ where: { userId } }),

    getByEmail: (email: string) =>
      db.query.user.findFirst({ where: { email } }),

    getByAuthProviderId: (authId: string) =>
      db.query.user.findFirst({ where: { authProviderId: authId } }),

    getWithProfile: (userId: string) =>
      db.query.user.findFirst({
        where: { userId },
        with: { profile: { with: { avatar: true } } },
      }),

    getModeratorProfiles: (userId: string) =>
      db.query.profileMember.findMany({
        where: { userId },
        with: { profile: true },
      }),
  },

  // ── Profile ─────────────────────────────────────────────────
  profile: {
    getByUserId: (userId: string) =>
      db.query.profile.findFirst({ where: { userId } }),

    getModerators: (profileId: string) =>
      db.query.profileMember.findMany({
        where: { profileId },
        with: { user: true },
      }),
  },

  // ── Post ────────────────────────────────────────────────────
  post: {
    /**
     * "For You" — all published posts newest-first, cursor-paginated.
     * Cursor = published_at ISO string of the last post seen.
     * On first call, omit cursor to get the absolute newest posts.
     */
    getFeed: (limit = 15, cursor?: string) =>
      db.query.post.findMany({
        where: cursor
          ? { is_published: true, published_at: { lt: new Date(cursor) } }
          : { is_published: true },
        orderBy: { published_at: 'desc' },
        limit,
        with: WITH_FEED_AUTHOR,
      }),

    /**
     * "Following" — posts from users this person follows.
     * Two queries: (1) get followedIds, (2) filter posts by those IDs.
     * Can't do a subquery in the relational query API, so we split.
     */
    getFollowingFeed: async (userId: string, limit = 15, cursor?: string) => {
      const followed = await db.query.follow.findMany({
        where: { followerId: userId },
        columns: { followedId: true },
      })

      if (!followed.length) return []

      const ids = followed.map((f) => f.followedId)

      return db.query.post.findMany({
        where: cursor
          ? { is_published: true, author_id: { in: ids }, published_at: { lt: new Date(cursor) } }
          : { is_published: true, author_id: { in: ids } },
        orderBy: { published_at: 'desc' },
        limit,
        with: WITH_FEED_AUTHOR,
      })
    },

    getById: (postId: string) =>
      db.query.post.findFirst({
        where: { postId },
        with: {
          primaryAuthor: { with: { profile: { with: { avatar: true } } } },
          media: true,
          commentsList: true,
        },
      }),

    getByAuthor: (authorId: string) =>
      db.query.post.findMany({
        where: { author_id: authorId },
        orderBy: { createdAt: 'desc' },
        with: WITH_FEED_AUTHOR,
      }),
  },

  // ── Comment ─────────────────────────────────────────────────
  comment: {
    getByPost: (postId: string) =>
      db.query.comment.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        with: { author: true, replies: true },
      }),
  },

  // ── Report ──────────────────────────────────────────────────
  report: {
    getPending: () =>
      db.query.report.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
  },

  // ── Notification ────────────────────────────────────────────
  notification: {
    getUnread: (userId: string) =>
      db.query.notification.findMany({
        where: { userId, read: false },
        orderBy: { createdAt: 'desc' },
      }),
  },
}
