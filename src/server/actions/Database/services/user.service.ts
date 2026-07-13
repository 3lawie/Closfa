import { createServerFn } from '@tanstack/react-start'
import { authMiddleware, optionalAuthMiddleware, rateLimiterMiddleWare } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { updateProfileValidation, uploadAvatarValidation, updateDisplayNameValidation } from '@/verification/profile.validation'
import { searchUsersByNicknameValidation } from '@/verification/role.validation'
import { eq, ilike } from 'drizzle-orm'
import { z } from 'zod'
import { queries } from '@/server/queries'
import { createId } from '@paralleldrive/cuid2'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { serverEnv } from '@/lib/env/server-env'
import { createSession } from '@/server/lib/session'
import { safeDisplayName, isEmailDerivedNickname } from '@/lib/utils/format'

export async function upsertAuthUser(userInfo: {
  sub: string;
  name: string;
  email: string;
  authProvider: string;
  email_verified?: boolean;
}) {
  let [user] = await db.select().from(schema.user).where(eq(schema.user.authProviderId, userInfo.sub)).limit(1)

  if (!user) {
    const userId = createId()

    // .returning() gives back the real, fully-typed inserted row — no cast.
    const [inserted] = await db.insert(schema.user).values({
      userId,
      name: userInfo.name,
      nickname: null, // Must be claimed during onboarding
      email: userInfo.email,
      authProviderId: userInfo.sub,
      authProvider: userInfo.authProvider,
      emailVerified: userInfo.email_verified ?? false,
    }).returning()

    // Create the user's profile record (one-to-one with user)
    await db.insert(schema.profile).values({
      profile_id: createId(),
      userId,
      isVerified: false,
    })

    user = inserted
  }

  // Bootstrap the sole site owner: whoever logs in matching OWNER_EMAIL
  // auto-becomes 'owner' — checked on every login (not just first-ever
  // signup), so setting OWNER_EMAIL after an account already exists still
  // takes effect on its next login. No app-level path can grant 'owner'
  // otherwise. The DB's partial unique index (site_role_single_owner_idx)
  // is the actual source of truth for "at most one owner ever"; site_role's
  // own per-user unique constraint also guards re-granting someone who
  // already holds a role — the 23505 catch below makes either conflict a
  // harmless no-op instead of a failed login.
  if (serverEnv.ownerEmail && userInfo.email.toLowerCase() === serverEnv.ownerEmail.toLowerCase()) {
    try {
      await db.insert(schema.siteRole).values({
        id: createId(),
        userId: user.userId,
        role: 'owner',
        assignedBy: null,
      })
    } catch (e) {
      const pgError = e as { code?: string }
      if (pgError.code !== '23505') {
        logger.error('owner bootstrap failed', { userId: user.userId }, e instanceof Error ? e : undefined)
      }
    }
  }

  return user
}

/** Registers an already-ImageKit-uploaded file as a media row, for use as a profile avatar. */
export const uploadAvatarFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(uploadAvatarValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ mediaId: string }>> => {
    const { userId } = context.session

    try {
      const [row] = await db.insert(schema.media).values({
        user_id: userId,
        media_type: 'image',
        mediaUrl: data.mediaUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
      }).returning({ media_id: schema.media.media_id })

      return ok({ mediaId: row.media_id })
    } catch (e) {
      logger.error('uploadAvatar failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to upload avatar')
    }
  })

export const updateProfile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(updateProfileValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ updated: true }>> => {
    const { userId } = context.session
    const profileData = data

    try {
      // Ownership is implicit: a user can only update their OWN profile, keyed by
      // the session userId — never a client-supplied profile id.
      await db.update(schema.profile)
        .set({
          bio: profileData.bio,
          website: profileData.website,
          location: profileData.location,
          avatar: profileData.imageMediaId, // mediaId of an uploaded avatar
          hideEngagementCounts: profileData.hideEngagementCounts,
          updatedAt: new Date(),
        })
        .where(eq(schema.profile.userId, userId))

      return ok({ updated: true })
    } catch (e) {
      logger.error('updateProfile failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update profile')
    }
  })

/**
 * Change display name and/or nickname after onboarding — the only path to
 * this today was the one-time claim during onboarding, with no way back if
 * that nickname turned out to be identifying (e.g. an email-derived handle
 * Auth0 suggested at signup).
 */
export const updateDisplayName = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(updateDisplayNameValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ name: string; nickname: string }>> => {
    const { session } = context
    const nickname = data.nickname.trim().toLowerCase()

    if (isEmailDerivedNickname(nickname, session.email)) {
      return err('BAD_REQUEST', 'For your privacy, please choose a nickname that is not based on your email address.')
    }

    try {
      await db.update(schema.user)
        .set({ name: data.name, nickname })
        .where(eq(schema.user.userId, session.userId))

      // Re-mint the cookie — every route/component that reads session.nickname
      // (profile links, the account rail, etc.) would otherwise show the old
      // value until the cookie naturally refreshed.
      await createSession({
        sessionData: { ...session, name: data.name, nickname },
        existingIssuedAt: session.issuedAt,
      })

      return ok({ name: data.name, nickname })
    } catch (e) {
      const pgError = e as { code?: string }
      if (pgError.code === '23505') {
        return err('BAD_REQUEST', 'This nickname is already taken by another user.')
      }
      logger.error('updateDisplayName failed', { userId: session.userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update name/nickname')
    }
  })

export const getUserProfileFn = createServerFn({ method: 'GET' })
  .middleware([optionalAuthMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ nickname: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const { nickname } = data
    const currentUserId = context.session?.userId
    
    // Fetch the user and profile
    const user = await queries.user.getByNickname(nickname)
    if (!user) {
      return null
    }

    // Fetch the user's posts
    const posts = await queries.post.getByAuthor(user.userId)

    // Fetch follower and following counts
    const followers = await queries.follow.getFollowers(user.userId)
    const following = await queries.follow.getFollowing(user.userId)

    const isFollowing = currentUserId
      ? followers.some(f => f.followerId === currentUserId)
      : false

    // `name` is whatever the auth provider sent at signup — some connections
    // send the email address itself. Never let that reach a profile page or
    // any post attributed to this user; fall back to the (user-chosen, safe)
    // nickname everywhere this profile's name would otherwise be shown.
    const safeName = safeDisplayName(user.name, user.nickname)
    const sanitizedUser = { ...user, name: safeName }
    const sanitizedPosts = posts.map((p) => ({
      ...p,
      primaryAuthor: p.primaryAuthor ? { ...p.primaryAuthor, name: safeName } : p.primaryAuthor,
    })) as unknown as typeof posts

    // Surface the pinned post first, if one's set and still published — a
    // post unpinned itself by going back to draft after being pinned should
    // just fall back to normal chronological order, not disappear.
    const pinnedPostId = user.profile?.pinnedPostId ?? null
    const orderedPosts = pinnedPostId
      ? [...sanitizedPosts].sort((a, b) => {
          if (a.postId === pinnedPostId && a.is_published) return -1
          if (b.postId === pinnedPostId && b.is_published) return 1
          return 0
        })
      : sanitizedPosts

    return {
      user: sanitizedUser,
      posts: orderedPosts,
      stats: {
        followers: followers.length,
        following: following.length,
      },
      isFollowing,
    }
  })

// Prefix search over nicknames — backs the "search nicknames" UI used to find
// a user to promote to moderator. Builder API + operator function throughout
// (never the relational db.query API) so this stays on one ORM style per
// invariant #2. % and _ are escaped so user input can't widen the match into
// an unintended wildcard pattern.
export const searchUsersByNicknameFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(searchUsersByNicknameValidation)
  .handler(async ({ data }) => {
    const escaped = data.query.replace(/[%_\\]/g, (ch) => `\\${ch}`)

    const results = await db
      .select({
        userId: schema.user.userId,
        nickname: schema.user.nickname,
        name: schema.user.name,
      })
      .from(schema.user)
      .where(ilike(schema.user.nickname, `${escaped}%`))
      .limit(10)

    // `name` is whatever the auth provider sent at signup — for some
    // connections that's literally the user's email address. Never let
    // that reach a search-result list; fall back to the nickname.
    return results.map((r) => ({ ...r, name: safeDisplayName(r.name, r.nickname) }))
  })
