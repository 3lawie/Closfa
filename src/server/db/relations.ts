import { defineRelations } from "drizzle-orm";
import { schema } from "./schema";


export const relations = defineRelations(schema, (r) => ({
    // profile belongs to one user, has one media (avatar)
    profile: {
        user: r.one.user({
            from: r.profile.userId,
            to: r.user.userId,
        }),
        avatar: r.one.media({
            from: r.profile.image,
            to: r.media.media_id,
        }),
        members: r.many.profileMember(),
    },

    // user has one profile, many posts, and follow groups
    user: {
        profile: r.one.profile({
            from: r.user.userId,
            to: r.profile.userId,
        }),
        posts: r.many.post({
            from: r.user.userId.through(r.postToUser.user_id),
            to: r.post.postId.through(r.postToUser.post_id),
        }),

        // People who follow this user (followedId = me)
        followers: r.many.follow({
            from: r.user.userId,
            to: r.follow.followedId,
            alias: "followers",
        }),

        // People this user follows (followerId = me)
        following: r.many.follow({
            from: r.user.userId,
            to: r.follow.followerId,
            alias: "following",
        }),

        profileRoles: r.many.profileMember({
            from: r.user.userId,
            to: r.profileMember.userId,
        }),
        assignedRoles: r.many.profileMember({
            from: r.user.userId,
            to: r.profileMember.assignedBy,
        }),
        reportsFiled: r.many.report({
            from: r.user.userId,
            to: r.report.reporterId,
        }),
        reportsReviewed: r.many.report({
            from: r.user.userId,
            to: r.report.reviewedBy,
        }),
        notifications: r.many.notification({
            from: r.user.userId,
            to: r.notification.userId,
        }),
        createdNotifications: r.many.notification({
            from: r.user.userId,
            to: r.notification.actorId,
        }),
        auditLogs: r.many.auditLog({
            from: r.user.userId,
            to: r.auditLog.actorId,
        }),
    },

    // follow row: links follower → following
    follow: {
        follower: r.one.user({
            from: r.follow.followerId,
            to: r.user.userId,
            alias: "follower",
        }),
        followed: r.one.user({
            from: r.follow.followedId,
            to: r.user.userId,
            alias: "followed",
        }),
    },

    // media can be attached to profile, post, comment, or reply
    media: {
        uploader: r.one.user({
            from: r.media.user_id,
            to: r.user.userId,
        }),
    },

    // post belongs to one user, has many comments, many categories (through junction)
    post: {
        author: r.many.user({
            from: r.post.author_id.through(r.postToUser.post_id),
            to: r.user.userId.through(r.postToUser.user_id),
        }),
        commentsList: r.many.comment(),
        // Many categories through the junction table
        categories: r.many.categories({
            from: r.post.postId.through(r.postToCategory.post_id),
            to: r.categories.name.through(r.postToCategory.category_name),
        }),
        // Post's attached media
        media: r.many.media({
            from: r.post.postId.through(r.postToMedia.post_id),
            to: r.media.media_id.through(r.postToMedia.media_id),
        }),
    },

    // category has many posts (through junction)
    categories: {
        posts: r.many.post({
            from: r.categories.name.through(r.postToCategory.category_name),
            to: r.post.postId.through(r.postToCategory.post_id),
        }),
    },

    // junction: postToCategory
    postToCategory: {
        post: r.one.post({
            from: r.postToCategory.post_id,
            to: r.post.postId,
        }),
        category: r.one.categories({
            from: r.postToCategory.category_name,
            to: r.categories.name,
        }),
    },
    postToUser: {
        post: r.one.post({
            from: r.postToUser.post_id,
            to: r.post.postId,
        }),
        user: r.one.user({
            from: r.postToUser.user_id,
            to: r.user.userId,
        }),
    },
    postToMedia: {
        post: r.one.post({
            from: r.postToMedia.post_id,
            to: r.post.postId,
        }),
        media: r.one.media({
            from: r.postToMedia.media_id,
            to: r.media.media_id,
        }),
    },

    // comment belongs to one user and one post, has many replies
    comment: {
        author: r.one.user({
            from: r.comment.userId,
            to: r.user.userId,
        }),
        post: r.one.post({
            from: r.comment.postId,
            to: r.post.postId,
        }),
        replies: r.many.commentReply(),
        // Comment's attached media (stickers, etc.)
        media: r.one.media({
            from: r.comment.media_id,
            to: r.media.media_id,
        }),
    },

    // commentReply belongs to one comment (parent), one user (author), one post
    commentReply: {
        parentComment: r.one.comment({
            from: r.commentReply.parent_comment_id,
            to: r.comment.comment_id,
        }),
        author: r.one.user({
            from: r.commentReply.user_id,
            to: r.user.userId,
        }),
        post: r.one.post({
            from: r.commentReply.post_id,
            to: r.post.postId,
        }),
        // Reply's attached media
        media: r.one.media({
            from: r.commentReply.media_id,
            to: r.media.media_id,
        }),
    },

    profileMember: {
        profile: r.one.profile({
            from: r.profileMember.profileId,
            to: r.profile.profile_id,
        }),
        user: r.one.user({
            from: r.profileMember.userId,
            to: r.user.userId,
        }),
        assignedByUser: r.one.user({
            from: r.profileMember.assignedBy,
            to: r.user.userId,
        }),
    },

    report: {
        reporter: r.one.user({
            from: r.report.reporterId,
            to: r.user.userId,
        }),
        reviewedByUser: r.one.user({
            from: r.report.reviewedBy,
            to: r.user.userId,
        }),
    },

    auditLog: {
        actor: r.one.user({
            from: r.auditLog.actorId,
            to: r.user.userId,
        }),
    },

    notification: {
        user: r.one.user({
            from: r.notification.userId,
            to: r.user.userId,
        }),
        actor: r.one.user({
            from: r.notification.actorId,
            to: r.user.userId,
        }),
    },
}))
