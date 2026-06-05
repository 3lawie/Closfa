// ──────────────────────────────────────────────────────────────
// Queries — single file containing ALL read-only database queries
//
// WHY one file?
// - Easy to find any query: queries.user.getById()
// - No import chains — one import gives you everything
// - Read queries are simple and don't need auth checks
//   (auth is enforced by the server functions that CALL these queries)
// ──────────────────────────────────────────────────────────────

import { db } from './db'
import { schema } from './db/schema'
import { eq, desc, and } from 'drizzle-orm'

export const queries = {
  user: {
    getById: (userId: string) =>
      db.query.user.findFirst({
        where: eq(schema.user.userId, userId),
      }),

    getByEmail: (email: string) =>
      db.query.user.findFirst({
        where: eq(schema.user.email, email),
      }),

    getByAuthProviderId: (authId: string) =>
      db.query.user.findFirst({
        where: eq(schema.user.authProviderId, authId),
      }),

    getModeratorProfiles: (userId: string) =>
      db.query.profileMember.findMany({
        where: eq(schema.profileMember.userId, userId),
        with: { profile: true },
      }),
  },

  profile: {
    getByUserId: (userId: string) =>
      db.query.profile.findFirst({
        where: eq(schema.profile.userId, userId),
      }),

    getModerators: (profileId: string) =>
      db.query.profileMember.findMany({
        where: eq(schema.profileMember.profileId, profileId),
        with: { user: true },
      }),
  },

  post: {
    getFeed: (limit = 20) =>
      db.query.post.findMany({
        where: eq(schema.post.is_published, true),
        orderBy: desc(schema.post.published_at),
        limit,
        with: { author: true, media: true },
      }),

    getById: (postId: string) =>
      db.query.post.findFirst({
        where: eq(schema.post.postId, postId),
        with: { author: true, media: true, comments: true },
      }),

    getByAuthor: (authorId: string) =>
      db.query.post.findMany({
        where: eq(schema.post.author_id, authorId),
        orderBy: desc(schema.post.createdAt),
      }),
  },

  comment: {
    getByPost: (postId: string) =>
      db.query.comment.findMany({
        where: eq(schema.comment.postId, postId),
        orderBy: desc(schema.comment.createdAt),
        with: { author: true, replies: true },
      }),
  },

  report: {
    getPending: () =>
      db.query.report.findMany({
        where: eq(schema.report.status, 'pending'),
        orderBy: desc(schema.report.createdAt),
      }),
  },

  notification: {
    getUnread: (userId: string) =>
      db.query.notification.findMany({
        where: and(
          eq(schema.notification.userId, userId),
          eq(schema.notification.read, false),
        ),
        orderBy: desc(schema.notification.createdAt),
      }),
  },
}
