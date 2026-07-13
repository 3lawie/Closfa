import { defineRelations } from "drizzle-orm";
import { schema } from "./schema";

export const relations = defineRelations(schema, (r) => ({
  // ── profile ─────────────────────────────────────────────────
  profile: {
    user: r.one.user({ from: r.profile.userId, to: r.user.userId }),
    // Direct FK → media: the avatar image record
    // Renamed to `avatarMedia` to avoid collision with the `avatar` column
    avatarMedia: r.one.media({ from: r.profile.avatar, to: r.media.media_id }),
    members: r.many.profileMember(),
  },

  // ── user ─────────────────────────────────────────────────────
  user: {
    profile: r.one.profile({ from: r.user.userId, to: r.profile.userId }),
    // m2m collab posts through junction
    posts: r.many.post({
      from: r.user.userId.through(r.postToUser.user_id),
      to: r.post.postId.through(r.postToUser.post_id),
    }),
    followers: r.many.follow({ from: r.user.userId, to: r.follow.followedId, alias: "followers" }),
    following: r.many.follow({ from: r.user.userId, to: r.follow.followerId, alias: "following" }),
    profileRoles: r.many.profileMember({ from: r.user.userId, to: r.profileMember.userId }),
    assignedRoles: r.many.profileMember({ from: r.user.userId, to: r.profileMember.assignedBy }),
    reportsFiled: r.many.report({ from: r.user.userId, to: r.report.reporterId }),
    reportsReviewed: r.many.report({ from: r.user.userId, to: r.report.reviewedBy }),
    notifications: r.many.notification({ from: r.user.userId, to: r.notification.userId }),
    createdNotifications: r.many.notification({ from: r.user.userId, to: r.notification.actorId }),
    auditLogs: r.many.auditLog({ from: r.user.userId, to: r.auditLog.actorId }),
    siteRole: r.one.siteRole({ from: r.user.userId, to: r.siteRole.userId }),
    blockedUsers: r.many.userBlock({ from: r.user.userId, to: r.userBlock.blockerId, alias: "blockedUsers" }),
    blockedBy: r.many.userBlock({ from: r.user.userId, to: r.userBlock.blockedId, alias: "blockedBy" }),
    savedPosts: r.many.savedPost({ from: r.user.userId, to: r.savedPost.userId }),
  },

  // ── follow ────────────────────────────────────────────────────
  follow: {
    follower: r.one.user({ from: r.follow.followerId, to: r.user.userId, alias: "follower" }),
    followed: r.one.user({ from: r.follow.followedId, to: r.user.userId, alias: "followed" }),
  },

  // ── media ─────────────────────────────────────────────────────
  media: {
    uploader: r.one.user({ from: r.media.user_id, to: r.user.userId }),
  },

  // ── post ──────────────────────────────────────────────────────
  post: {
    // Direct FK: the solo/primary author — used for feed queries & card display
    // This is a one-to-one relation directly on post.author_id → user.userId
    // (Separate from the m2m "author" relation below which handles collab posts)
    primaryAuthor: r.one.user({
      from: r.post.author_id,
      to: r.user.userId,
    }),

    // m2m collab authors (through postToUser junction) — only relevant for collab posts
    author: r.many.user({
      from: r.post.author_id.through(r.postToUser.post_id),
      to: r.user.userId.through(r.postToUser.user_id),
    }),

    commentsList: r.many.comment(),

    categories: r.many.categories({
      from: r.post.postId.through(r.postToCategory.post_id),
      to: r.categories.name.through(r.postToCategory.category_name),
    }),

    media: r.many.media({
      from: r.post.postId.through(r.postToMedia.post_id),
      to: r.media.media_id.through(r.postToMedia.media_id),
    }),
  },

  // ── categories ───────────────────────────────────────────────
  categories: {
    posts: r.many.post({
      from: r.categories.name.through(r.postToCategory.category_name),
      to: r.post.postId.through(r.postToCategory.post_id),
    }),
  },

  // ── junction tables ─────────────────────────────────────────
  postToCategory: {
    post: r.one.post({ from: r.postToCategory.post_id, to: r.post.postId }),
    category: r.one.categories({ from: r.postToCategory.category_name, to: r.categories.name }),
  },
  postToUser: {
    post: r.one.post({ from: r.postToUser.post_id, to: r.post.postId }),
    user: r.one.user({ from: r.postToUser.user_id, to: r.user.userId }),
  },
  postToMedia: {
    post: r.one.post({ from: r.postToMedia.post_id, to: r.post.postId }),
    media: r.one.media({ from: r.postToMedia.media_id, to: r.media.media_id }),
  },

  // ── comment ─────────────────────────────────────────────────
  comment: {
    author: r.one.user({ from: r.comment.userId, to: r.user.userId }),
    post: r.one.post({ from: r.comment.postId, to: r.post.postId }),
    replies: r.many.commentReply(),
    media: r.one.media({ from: r.comment.media_id, to: r.media.media_id }),
  },

  // ── commentReply ─────────────────────────────────────────────
  commentReply: {
    parentComment: r.one.comment({ from: r.commentReply.parent_comment_id, to: r.comment.comment_id }),
    author: r.one.user({ from: r.commentReply.user_id, to: r.user.userId }),
    post: r.one.post({ from: r.commentReply.post_id, to: r.post.postId }),
    media: r.one.media({ from: r.commentReply.media_id, to: r.media.media_id }),
  },

  // ── profileMember ────────────────────────────────────────────
  profileMember: {
    profile: r.one.profile({ from: r.profileMember.profileId, to: r.profile.profile_id }),
    user: r.one.user({ from: r.profileMember.userId, to: r.user.userId }),
    assignedByUser: r.one.user({ from: r.profileMember.assignedBy, to: r.user.userId }),
  },

  // ── report ───────────────────────────────────────────────────
  report: {
    reporter: r.one.user({ from: r.report.reporterId, to: r.user.userId }),
    reviewedByUser: r.one.user({ from: r.report.reviewedBy, to: r.user.userId }),
  },

  // ── auditLog ─────────────────────────────────────────────────
  auditLog: {
    actor: r.one.user({ from: r.auditLog.actorId, to: r.user.userId }),
  },

  // ── notification ─────────────────────────────────────────────
  notification: {
    user: r.one.user({ from: r.notification.userId, to: r.user.userId }),
    actor: r.one.user({ from: r.notification.actorId, to: r.user.userId }),
  },

  // ── siteRole ─────────────────────────────────────────────────
  siteRole: {
    user: r.one.user({ from: r.siteRole.userId, to: r.user.userId }),
    assignedByUser: r.one.user({ from: r.siteRole.assignedBy, to: r.user.userId }),
  },

  // ── roleGrant ────────────────────────────────────────────────
  roleGrant: {
    createdByUser: r.one.user({ from: r.roleGrant.createdBy, to: r.user.userId }),
    redeemedByUser: r.one.user({ from: r.roleGrant.redeemedBy, to: r.user.userId }),
  },

  // ── userBlock ────────────────────────────────────────────────
  userBlock: {
    blocker: r.one.user({ from: r.userBlock.blockerId, to: r.user.userId, alias: "blocker" }),
    blocked: r.one.user({ from: r.userBlock.blockedId, to: r.user.userId, alias: "blocked" }),
  },

  // ── savedPost ────────────────────────────────────────────────
  savedPost: {
    user: r.one.user({ from: r.savedPost.userId, to: r.user.userId }),
    post: r.one.post({ from: r.savedPost.postId, to: r.post.postId }),
  },
}))
