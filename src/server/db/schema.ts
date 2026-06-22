import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";


export const postStatusEnum = pgEnum("post_status", [
    "editing", "draft", "pending", "published", "unpublished", "archived", "rejected"
])

export const postTypeEnum = pgEnum("post_type", [
    "collab", "solo"
])

export const commentTypeEnum = pgEnum("comment_type", [
    "text", "sticker"
])

export const mediaTypeEnum = pgEnum("media_type", [
    "image", "video", "audio"
])

// Resolution labels — computed from width/height on upload
// SD = below 720p, HD = 720p, FHD = 1080p, QHD = 1440p, UHD = 4K+
export const resolutionEnum = pgEnum("resolution", [
    "SD", "HD", "FHD", "QHD", "UHD"
])

// ──────────────────────────────────────────────────────────────
// Media table — uploaded first, then referenced by profile/post/comment
// Fields are nullable based on media_type (enforced by CHECK constraints)
// ──────────────────────────────────────────────────────────────
export const media = pgTable("media", {
    media_id: varchar("media_id").primaryKey().$defaultFn(() => createId()),
    user_id: varchar("user_id").notNull(),  // who uploaded it (no FK to avoid circular ref with user)

    // ── Core fields (required for all types) ──
    media_type: mediaTypeEnum("media_type").notNull(),
    mediaUrl: varchar("media_url").notNull(),      // ImageKit path or external URL
    fileName: varchar("file_name").notNull(),       // original file name
    mimeType: varchar("mime_type").notNull(),       // 'image/avif', 'video/mp4', 'audio/mpeg'
    fileSize: integer("file_size"),                 // bytes

    // ── Visual fields (image + video only, NULL for audio) ──
    width: integer("width"),                        // pixels
    height: integer("height"),                      // pixels
    aspectRatio: numeric("aspect_ratio"),           // width / height, e.g. 1.78
    resolution: resolutionEnum("resolution"),       // computed label: SD, HD, FHD, QHD, UHD

    // ── Temporal fields (video + audio only, NULL for image) ──
    duration: integer("duration"),                  // seconds

    createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
    mediaUserIndex: index("media_user_index").on(table.user_id),
    mediaTypeIndex: index("media_type_index").on(table.media_type),

    // Images and videos MUST have width + height
    visualMediaRequiresDimensions: check(
        "visual_media_requires_dimensions",
        sql`(${table.media_type} = 'audio' OR (${table.width} IS NOT NULL AND ${table.height} IS NOT NULL))`
    ),
    // Audio MUST NOT have width/height
    audioNoDimensions: check(
        "audio_no_dimensions",
        sql`(${table.media_type} <> 'audio' OR (${table.width} IS NULL AND ${table.height} IS NULL))`
    ),
    // Video and audio MUST have duration
    temporalMediaRequiresDuration: check(
        "temporal_media_requires_duration",
        sql`(${table.media_type} = 'image' OR ${table.duration} IS NOT NULL)`
    ),
    // Images MUST NOT have duration
    imageNoDuration: check(
        "image_no_duration",
        sql`(${table.media_type} <> 'image' OR ${table.duration} IS NULL)`
    ),
}))

export const user = pgTable("user", {
    userId: varchar("user_id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull(),
    nickname: text("nickname").unique(),
    email: text("email").notNull().unique(),
    authProviderId: text("auth_provider_id").notNull(),
    authProvider: text("auth_provider").notNull().default("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
    userEmailIndex: index("user_email_index").on(table.email),
    userNicknameIndex: index("user_nickname_index").on(table.nickname),
}));

// Who follows whom:
//   userId      = the person doing the following (follower)
//   followingId = the person being followed
// Query "who does X follow?" → WHERE user_id = X
// Query "who follows X?"     → WHERE following_id = X
export const follow = pgTable("follow", {
    followId: varchar("follow_id").primaryKey().$defaultFn(() => createId()),
    followedId: varchar("user_id").notNull().references(() => user.userId),
    followerId: varchar("follower_id").notNull().references(() => user.userId),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
    followIndex: index("follow_index").on(table.followerId, table.followedId),
    followUnique: unique("follow_unique").on(table.followerId, table.followedId),
}))

export const profile = pgTable("profile", {
    profile_id: varchar("profile_id").primaryKey().$defaultFn(() => createId()),
    userId: varchar("user_id").notNull().references(() => user.userId),
    bio: text("bio"),
    website: text("website"),
    location: text("location"),
    avatar: varchar("image").references(() => media.media_id),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

// Admin-defined categories. name is the PK — prevents duplicates and allows
// direct lookup/reference by name (used by the AI categorization system).
export const categories = pgTable("categories", {
    name: text("name").primaryKey(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const post = pgTable("post", {
    postId: varchar("post_id").primaryKey().$defaultFn(() => createId()),
    content: text("content"),
    author_id: varchar("author_id").notNull().references(() => user.userId),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // FK to categories.name — DB rejects any AI-assigned category not in the list
    post_category: text("post_category").notNull().references(() => categories.name),
    post_status: postStatusEnum("post_status").notNull().default("draft"),
    post_type: postTypeEnum("post_type").notNull().default("solo"),
    is_published: boolean("is_published").notNull().default(false),
    published_at: timestamp("published_at"),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
}, (table) => ({
    postAuthorIndex: index("post_author_index").on(table.author_id, table.post_status),
    postStatusIndex: index("post_status_index").on(table.post_status),
    postCategoryIndex: index("post_category_index").on(table.post_category),
    postPublishedAtIndex: index("post_published_at_index").on(table.published_at),
}))

// Junction: many posts ↔ many categories (for multi-category tagging)
export const postToCategory = pgTable("post_to_category", {
    post_id: varchar("post_id").notNull().references(() => post.postId),
    category_name: text("category_name").notNull().references(() => categories.name),
}, (table) => ({
    pk: primaryKey({ columns: [table.post_id, table.category_name] }),
}))

export const postToUser = pgTable("post_to_user", {
    post_id: varchar("post_id").notNull().references(() => post.postId),
    user_id: varchar("user_id").notNull().references(() => user.userId),
}, (table) => ({
    pk: primaryKey({ columns: [table.post_id, table.user_id] }),
}))

export const postToMedia = pgTable("post_to_media", {
    post_id: varchar("post_id").notNull().references(() => post.postId),
    media_id: varchar("media_id").notNull().references(() => media.media_id),
}, (table) => ({
    pk: primaryKey({ columns: [table.post_id, table.media_id] }),
}))

export const comment = pgTable("comment", {
    comment_id: varchar("comment_id").primaryKey().$defaultFn(() => createId()),
    userId: varchar("user_id").notNull().references(() => user.userId),
    postId: varchar("post_id").notNull().references(() => post.postId),
    comment: text("comment").notNull(),
    comment_type: commentTypeEnum("comment_type").notNull().default("text"),
    media_id: varchar("media_id").references(() => media.media_id),
    comment_likes: integer("comment_likes").notNull().default(0),
    comment_reply_count: integer("comment_reply_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
    commentUserIndex: index("comment_user_index").on(table.userId),
    commentPostCreatedAtIndex: index("comment_post_created_at_index").on(table.postId, table.createdAt),
    // Sticker comments must have a media_id
    mediaCheck: check("comment_sticker_requires_media", sql`(${table.comment_type} <> 'sticker' OR ${table.media_id} IS NOT NULL)`),
}))

export const commentReply = pgTable("comment_reply", {
    reply_id: varchar("comment_reply_id").primaryKey().$defaultFn(() => createId()),
    parent_comment_id: varchar("parent_comment_id").notNull().references(() => comment.comment_id),
    post_id: varchar("post_id").notNull().references(() => post.postId),
    user_id: varchar("user_id").notNull().references(() => user.userId),
    comment: text("comment").notNull(),
    comment_type: commentTypeEnum("comment_type").notNull().default("text"),
    media_id: varchar("media_id").references(() => media.media_id),
    comment_likes: integer("comment_likes").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
    commentReplyUserIndex: index("comment_reply_user_index").on(table.user_id),
    // Composite index: fetch replies for a comment sorted by time (most common query)
    commentReplyParentCreatedAtIndex: index("comment_reply_parent_created_at_index").on(table.parent_comment_id, table.createdAt),
    // Sticker replies must have a media_id
    mediaCheck: check("reply_sticker_requires_media", sql`(${table.comment_type} <> 'sticker' OR ${table.media_id} IS NOT NULL)`),
}))

export const profileRoleEnum = pgEnum("profile_role", [
    "co_owner", "vip_moderator", "moderator"
])

export const profileMember = pgTable("profile_member", {
    id: varchar("id").primaryKey().$defaultFn(() => createId()),
    profileId: varchar("profile_id").notNull().references(() => profile.profile_id),
    userId: varchar("user_id").notNull().references(() => user.userId),
    role: profileRoleEnum("role").notNull().default("moderator"),
    assignedAt: timestamp("assigned_at").defaultNow(),
    assignedBy: varchar("assigned_by").references(() => user.userId),
}, (table) => ({
    memberUnique: unique("profile_member_unique").on(table.profileId, table.userId),
    profileIndex: index("profile_member_profile_idx").on(table.profileId),
    userIndex: index("profile_member_user_idx").on(table.userId),
}))

export const reportStatusEnum = pgEnum("report_status", [
    "pending", "reviewed", "resolved", "dismissed"
])

export const report = pgTable("report", {
    id: varchar("id").primaryKey().$defaultFn(() => createId()),
    reporterId: varchar("reporter_id").notNull().references(() => user.userId),
    targetType: text("target_type").notNull(), // 'post', 'comment', 'user'
    targetId: varchar("target_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: varchar("reviewed_by").references(() => user.userId),
}, (table) => ({
    reportStatusIndex: index("report_status_idx").on(table.status),
}))

export const auditActionEnum = pgEnum("audit_action", [
    "delete_post", "delete_comment", "ban_user", "warn_user",
    "assign_role", "revoke_role", "hide_content"
])

export const auditLog = pgTable("audit_log", {
    id: varchar("id").primaryKey().$defaultFn(() => createId()),
    actorId: varchar("actor_id").notNull().references(() => user.userId),
    action: auditActionEnum("action").notNull(),
    targetType: text("target_type").notNull(), // 'post', 'comment', 'user', 'profile'
    targetId: varchar("target_id").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow(),
})

export const notificationTypeEnum = pgEnum("notification_type", [
    "like", "comment", "reply", "follow", "mention", "system", "moderation"
])

export const notification = pgTable("notification", {
    id: varchar("id").primaryKey().$defaultFn(() => createId()),
    userId: varchar("user_id").notNull().references(() => user.userId),
    actorId: varchar("actor_id").references(() => user.userId),
    type: notificationTypeEnum("type").notNull(),
    entityId: varchar("entity_id"), // Post ID, Comment ID, etc.
    message: text("message"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
    notificationUserIndex: index("notification_user_idx").on(table.userId, table.read),
}))

export const subscriptionStatusEnum = pgEnum("subscription_status", [
    "active", "canceled", "past_due", "unpaid"
])

export const subscription = pgTable("subscription", {
    id: varchar("id").primaryKey().$defaultFn(() => createId()),
    userId: varchar("user_id").notNull().references(() => user.userId),
    stripeCustomerId: varchar("stripe_customer_id"),
    stripeSubscriptionId: varchar("stripe_subscription_id"),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    planId: varchar("plan_id"),
    currentPeriodEnd: timestamp("current_period_end"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const schema = {
    user, follow, profile,
    categories, post, postToCategory,
    comment, commentReply,
    media, postToUser, postToMedia,
    profileMember, report, auditLog, notification, subscription
};