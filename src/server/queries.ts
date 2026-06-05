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

export const queries = {
  user: {
    getById: (userId: string) =>
      db.query.user.findFirst({
        where: { userId },
      }),

    getByEmail: (email: string) =>
      db.query.user.findFirst({
        where: { email },
      }),

    getByAuthProviderId: (authId: string) =>
      db.query.user.findFirst({
        where: { authProviderId: authId },
      }),

    getModeratorProfiles: (userId: string) =>
      db.query.profileMember.findMany({
        where: { userId },
        with: { profile: true },
      }),
  },

  profile: {
    getByUserId: (userId: string) =>
      db.query.profile.findFirst({
        where: { userId },
      }),

    getModerators: (profileId: string) =>
      db.query.profileMember.findMany({
        where: { profileId },
        with: { user: true },
      }),
  },

  post: {
    getFeed: (limit = 20) =>
      db.query.post.findMany({
        where: { is_published: true },
        orderBy: { published_at: 'desc' },
        limit,
        with: { author: true, media: true },
      }),

    getById: (postId: string) =>
      db.query.post.findFirst({
        where: { postId },
        with: { author: true, media: true, commentsList: true },
      }),

    getByAuthor: (authorId: string) =>
      db.query.post.findMany({
        where: { author_id: authorId },
        orderBy: { createdAt: 'desc' },
      }),
  },

  comment: {
    getByPost: (postId: string) =>
      db.query.comment.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        with: { author: true, replies: true },
      }),
  },

  report: {
    getPending: () =>
      db.query.report.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
  },

  notification: {
    getUnread: (userId: string) =>
      db.query.notification.findMany({
        where: {
          userId,
          read: false,
        },
        orderBy: { createdAt: 'desc' },
      }),
  },
}


