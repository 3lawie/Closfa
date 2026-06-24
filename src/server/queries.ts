// ──────────────────────────────────────────────────────────────
// Queries — ALL read-only DB queries in one file.
//
// Uses Drizzle v1 beta object-filter syntax for `where`.
// Cursor pagination uses nested operator syntax:
//   { published_at: { lt: new Date(cursor) } }
// rather than the callback form which is a v0.x pattern.
// ──────────────────────────────────────────────────────────────

import { db } from './db'
import { follow } from './db/schema'

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
    getFeed: (limit = 15, page = 1) => {
      const offset = (page - 1) * limit;
      return db.query.post.findMany({
        where: (post, { and, eq, gte }) => and(
          eq(post.is_published, true),
          gte(post.published_at, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // last 30 days
        ),
        orderBy: (post, { desc }) => [desc(post.likes), desc(post.published_at)],
        limit,
        offset,
        with: WITH_FEED_AUTHOR,
      })
    },

    /**
     * "Following" — posts from users this person follows.
     * Uses a compound cursor (date_id) and supports bidirectional fetching.
     * Uses a subquery to avoid massive IN clauses.
     */
    getFollowingFeed: async (userId: string, limit = 15, cursor?: string, direction: 'older' | 'newer' = 'older') => {
      const posts = await db.query.post.findMany({
        where: (post, { and, eq, inArray, lt, gt, or }) => {
          const followedSubquery = db.select({ id: follow.followedId }).from(follow).where(eq(follow.followerId, userId));
          
          let cursorCondition = undefined;
          if (cursor) {
             const [dateStr, idStr] = cursor.split('_');
             const cursorDate = new Date(dateStr);
             if (direction === 'older') {
                cursorCondition = or(
                  lt(post.published_at, cursorDate),
                  and(eq(post.published_at, cursorDate), lt(post.postId, idStr))
                );
             } else {
                cursorCondition = or(
                  gt(post.published_at, cursorDate),
                  and(eq(post.published_at, cursorDate), gt(post.postId, idStr))
                );
             }
          }
          
          return and(
            eq(post.is_published, true),
            inArray(post.author_id, followedSubquery),
            cursorCondition
          );
        },
        orderBy: (post, { desc, asc }) => direction === 'older' 
          ? [desc(post.published_at), desc(post.postId)] 
          : [asc(post.published_at), asc(post.postId)],
        limit,
        with: WITH_FEED_AUTHOR,
      });

      // If fetching newer, we queried ASC so reverse it back to DESC for the client
      if (direction === 'newer') {
        posts.reverse();
      }
      return posts;
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
