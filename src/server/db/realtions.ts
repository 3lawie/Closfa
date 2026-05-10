import { defineRelations } from "drizzle-orm";
import { schema } from "./schema";


export const relations = defineRelations(schema, (r) => ({
    // profile belongs to one user
    profile: {
        user: r.one.user({
            from: r.profile.userId,
            to: r.user.userId,
        }),
    },

    // user has one profile, many posts, and follow groups
    user: {
        profile: r.one.profile({
            from: r.user.userId,
            to: r.profile.userId,
        }),
        posts: r.many.post(),

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

    // post belongs to one user, has many comments, many categories (through junction)
    post: {
        author: r.many.user({
            from: r.post.author_id.through(r.postToUser.post_id),
            to: r.user.userId.through(r.postToUser.user_id),
        }),
        comments: r.many.comment(),
        // Many categories through the junction table
        categories: r.many.categories({
            from: r.post.postId.through(r.postToCategory.post_id),
            to: r.categories.name.through(r.postToCategory.category_name),
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
    },
}))
