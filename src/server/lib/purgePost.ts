import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import { logger } from './logger'
import { deleteImageKitAssets } from '@/server/actions/ThirdParty/ImageKit/imagekit.delete'

/**
 * Hard-deletes a post and every row that FK-references it, in dependency
 * order (children before parents) — none of these have an ON DELETE CASCADE
 * configured, and this driver (neon-http) has no interactive transactions,
 * so this is a non-atomic sequence like every other multi-step write in this
 * codebase already accepts. Only ever called after a post's 3-day
 * scheduledPurgeAt grace period has passed (see deletePostRecord/
 * adminCompleteDeletePostFn in post.service.ts, and the daily cron in
 * worker-entry.ts) — never call this directly on a still-live post.
 *
 * `report`/`notification` rows referencing this post are deliberately left
 * alone — neither has a real FK to `post`, so a stale reference is harmless and
 * matches how the app already tolerates loose references elsewhere
 * (report.targetId, notification.entityId).
 *
 * `media` rows are NOT in that category and are now cleaned up. Leaving them
 * meant the uploaded files stayed in ImageKit indefinitely: a storage leak, and
 * a privacy failure — the CDN URL of a "deleted" post's image kept serving it.
 * Only media that no *other* post still references is removed, since
 * post_to_media is many-to-many.
 */
export async function purgePost(postId: string): Promise<void> {
  const replies = await db
    .select({ replyId: schema.commentReply.reply_id })
    .from(schema.commentReply)
    .where(eq(schema.commentReply.post_id, postId))
  const replyIds = replies.map((r) => r.replyId)

  const comments = await db
    .select({ commentId: schema.comment.comment_id })
    .from(schema.comment)
    .where(eq(schema.comment.postId, postId))
  const commentIds = comments.map((c) => c.commentId)

  if (replyIds.length > 0) {
    await db.delete(schema.commentReplyLike).where(inArray(schema.commentReplyLike.replyId, replyIds))
  }
  await db.delete(schema.commentReply).where(eq(schema.commentReply.post_id, postId))

  if (commentIds.length > 0) {
    await db.delete(schema.commentLike).where(inArray(schema.commentLike.commentId, commentIds))
  }
  await db.delete(schema.comment).where(eq(schema.comment.postId, postId))

  await db.delete(schema.postLike).where(eq(schema.postLike.postId, postId))
  await db.delete(schema.postToCategory).where(eq(schema.postToCategory.post_id, postId))
  await db.delete(schema.postToUser).where(eq(schema.postToUser.post_id, postId))

  // Captured BEFORE the join rows go, otherwise there's no way back to them.
  const attached = await db
    .select({ mediaId: schema.postToMedia.media_id })
    .from(schema.postToMedia)
    .where(eq(schema.postToMedia.post_id, postId))
  const attachedIds = attached.map((m) => m.mediaId)

  await db.delete(schema.postToMedia).where(eq(schema.postToMedia.post_id, postId))
  await db.delete(schema.savedPost).where(eq(schema.savedPost.postId, postId))

  // With this post's join rows gone, anything still referenced belongs to
  // another post and must survive — post_to_media is many-to-many.
  if (attachedIds.length > 0) {
    const stillUsed = await db
      .select({ mediaId: schema.postToMedia.media_id })
      .from(schema.postToMedia)
      .where(inArray(schema.postToMedia.media_id, attachedIds))
    const keep = new Set(stillUsed.map((m) => m.mediaId))
    const orphanIds = attachedIds.filter((id) => !keep.has(id))

    if (orphanIds.length > 0) {
      const orphans = await db
        .select({
          mediaId: schema.media.media_id,
          mediaUrl: schema.media.mediaUrl,
          thumbnailUrl: schema.media.thumbnailUrl,
        })
        .from(schema.media)
        .where(inArray(schema.media.media_id, orphanIds))

      // A video contributes two ImageKit objects: the file and its frame grab.
      const paths = orphans.flatMap((m) =>
        [m.mediaUrl, m.thumbnailUrl].filter((p): p is string => !!p && p.trim() !== ''),
      )

      // Best-effort and deliberately un-awaited-on-failure: deleteImageKitAssets
      // never throws, so a CDN outage leaks files rather than leaving a
      // half-purged post behind. Failures are logged inside.
      const result = await deleteImageKitAssets(paths)
      if (result.failed.length > 0) {
        logger.warn('purgePost: some ImageKit assets were not deleted', {
          postId, failedCount: result.failed.length, deleted: result.deleted,
        })
      }

      await db.delete(schema.media).where(inArray(schema.media.media_id, orphanIds))
    }
  }

  // Nulled, not deleted — a pinned post being purged should just leave the
  // profile with no pin, not touch the profile row itself.
  await db.update(schema.profile).set({ pinnedPostId: null }).where(eq(schema.profile.pinnedPostId, postId))

  await db.delete(schema.post).where(eq(schema.post.postId, postId))
}

/** Purges every post whose 3-day grace period has passed. Called by the daily cron (worker-entry.ts). */
export async function purgeExpiredRemovedPosts(): Promise<{ purged: number; failed: number }> {
  const due = await db
    .select({ postId: schema.post.postId })
    .from(schema.post)
    .where(and(
      eq(schema.post.post_status, 'removed'),
      isNotNull(schema.post.scheduledPurgeAt),
      lte(schema.post.scheduledPurgeAt, new Date()),
    ))

  let purged = 0
  let failed = 0

  for (const row of due) {
    try {
      await purgePost(row.postId)
      purged++
    } catch (e) {
      failed++
      logger.error('purgeExpiredRemovedPosts: failed to purge post', { postId: row.postId }, e instanceof Error ? e : undefined)
    }
  }

  return { purged, failed }
}
