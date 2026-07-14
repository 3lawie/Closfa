// Runs in the background after a post is published (see post.service.ts's
// `waitUntil(enrichPostForSearch(...))`) — never blocks the publish response.
// Video/audio posts: Whisper transcription → one combined Llama call for
// keywords + category + moderation (transcripts are messy spoken text, an
// LLM meaningfully outperforms pure statistics there). Text-only posts:
// free RAKE for keywords (written text doesn't have the same disfluency
// problem) + a separate, minimal moderation-only Llama call.
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { extractKeywords } from '@/lib/text/rake'
import { mergeKeywords } from '@/lib/text/keywordMerge'
import { transcribeMedia, analyzeTranscriptWithAI, moderateTextWithAI } from './workersAi'
import { logger } from './logger'
import { clientEnv } from '@/lib/env/client-env'

async function flagPostForReview(postId: string, reason: string): Promise<void> {
  const [post] = await db.select({ author_id: schema.post.author_id }).from(schema.post).where(eq(schema.post.postId, postId))
  if (!post) return

  // Reuses the existing admin-approval queue (Post Control page already
  // renders 'pending' posts with their moderationReason and has
  // approve/send-back/delete actions) — no new admin UI needed for this.
  await db.update(schema.post)
    .set({ post_status: 'pending', is_published: false, moderationReason: `AI-flagged for review: ${reason}` })
    .where(eq(schema.post.postId, postId))

  try {
    await db.insert(schema.notification).values({
      userId: post.author_id, actorId: null, type: 'moderation', entityId: postId, postId,
      message: 'Your post was flagged for review and is temporarily unpublished pending a moderator check.',
    })
  } catch (notifyError) {
    logger.error('flagPostForReview: notification failed', { postId }, notifyError instanceof Error ? notifyError : undefined)
  }
}

export async function enrichPostForSearch(postId: string): Promise<void> {
  try {
    const [post] = await db.select({ content: schema.post.content, keywords: schema.post.keywords }).from(schema.post).where(eq(schema.post.postId, postId))
    if (!post) return

    const mediaRows = await db
      .select({ media_type: schema.media.media_type, mediaUrl: schema.media.mediaUrl })
      .from(schema.postToMedia)
      .innerJoin(schema.media, eq(schema.postToMedia.media_id, schema.media.media_id))
      .where(eq(schema.postToMedia.post_id, postId))

    const transcribable = mediaRows.find((m) => m.media_type === 'video' || m.media_type === 'audio')

    if (transcribable) {
      // media.mediaUrl stores only the ImageKit PATH ("foo_bar.mp3"), not a
      // fetchable URL — every other place that renders media prefixes it
      // with clientEnv.imagekitUrlEndpoint (see PostCard.tsx's `IK` const).
      // This call site never did, so transcribeMedia's internal fetch()
      // threw "Invalid URL" immediately on every single video/audio post —
      // confirmed live against a real post, not hypothetical. Transcription
      // has never actually succeeded from this path before this fix.
      const mediaFullUrl = `${clientEnv.imagekitUrlEndpoint}/${transcribable.mediaUrl}`
      const transcript = await transcribeMedia(mediaFullUrl)
      if (transcript) {
        const categoryRows = await db.select({ name: schema.categories.name }).from(schema.categories)
        const allowedCategories = categoryRows.map((c) => c.name)

        const analysis = await analyzeTranscriptWithAI(transcript, allowedCategories)
        // AI keyword/category extraction is a nice-to-have on top of a
        // transcript that already exists — RAKE on the transcript itself is
        // the fallback if the LLM call fails, not silence.
        const aiSucceeded = !!analysis?.keywords.length
        const keywords = mergeKeywords(post.keywords, aiSucceeded ? analysis.keywords : extractKeywords(transcript))

        await db.update(schema.post)
          .set({
            transcript,
            keywords,
            ...(analysis?.category ? { post_category: analysis.category } : {}),
          })
          .where(eq(schema.post.postId, postId))

        logger.info('enrichPostForSearch: transcribed', { postId, aiSucceeded, keywordCount: keywords.length })

        if (analysis?.flagged) {
          await flagPostForReview(postId, analysis.flagReason ?? 'potential policy violation')
        }
        return
      }
      logger.warn('enrichPostForSearch: transcription failed or empty, falling back', { postId, mediaFullUrl })
    }

    // No transcribable media, or transcription failed — fall back to
    // RAKE on the post's own text, plus a moderation-only pass on that text.
    if (post.content) {
      const rakeKeywords = extractKeywords(post.content)
      if (rakeKeywords.length > 0) {
        const keywords = mergeKeywords(post.keywords, rakeKeywords)
        await db.update(schema.post).set({ keywords }).where(eq(schema.post.postId, postId))
        logger.info('enrichPostForSearch: RAKE fallback', { postId, keywordCount: keywords.length })
      } else {
        logger.warn('enrichPostForSearch: RAKE found nothing, keeping filename-only keywords', { postId, existingKeywordCount: post.keywords?.length ?? 0 })
      }

      const moderation = await moderateTextWithAI(post.content)
      if (moderation?.flagged) {
        await flagPostForReview(postId, moderation.reason ?? 'potential policy violation')
      }
    } else {
      logger.warn('enrichPostForSearch: no content and no successful transcript, keeping filename-only keywords', { postId, existingKeywordCount: post.keywords?.length ?? 0 })
    }
  } catch (e) {
    logger.error('enrichPostForSearch failed', { postId }, e instanceof Error ? e : undefined)
  }
}
