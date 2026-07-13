// ──────────────────────────────────────────────────────────────
// Permission System — profile-level RBAC (Role-Based Access Control)
//
// 4-tier hierarchy:
//   Level 4: owner        — full control (profile creator)
//   Level 3: co_owner     — delete content, ban users, assign moderators
//   Level 2: vip_moderator — hide content, mute users, pin posts, review reports
//   Level 1: moderator    — approve posts, delete comments, warn users
//
// Usage:
//   const perm = await getProfilePermission(userId, profileId)
//   if (perm.authorized && perm.canDeleteComment) { ... }
// ──────────────────────────────────────────────────────────────

import { db } from '@/server/db'
import { schema } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export const ROLE_LEVELS = {
  moderator: 1,
  vip_moderator: 2,
  co_owner: 3,
} as const

type ProfileRole = keyof typeof ROLE_LEVELS

export async function getProfilePermission(
  userId: string,
  profileId: string,
) {
  // Check if user is a member of this profile's mod team
  const membership = await db.query.profileMember.findFirst({
    where: {
      profileId,
      userId,
    } as any,
  })

  // Check if user is the profile owner
  const profile = await db.query.profile.findFirst({
    where: { profile_id: profileId } as any,
  })
  const isOwner = profile?.userId === userId

  const role: ProfileRole | 'owner' | null = isOwner
    ? 'owner'
    : membership?.role ?? null

  if (!role) {
    return { authorized: false as const, message: 'No permissions for this profile' }
  }

  const level = role === 'owner' ? 4 : ROLE_LEVELS[role as ProfileRole]

  return {
    authorized: true as const,
    role,
    level,
    // co_owner+ (level 3+)
    canDeleteContent: level >= ROLE_LEVELS.co_owner,
    canBanUser: level >= ROLE_LEVELS.co_owner,
    canAssignModerator: level >= ROLE_LEVELS.co_owner,
    canEditProfileSettings: level >= ROLE_LEVELS.co_owner,
    // vip_moderator+ (level 2+)
    canHideContent: level >= ROLE_LEVELS.vip_moderator,
    canMuteUser: level >= ROLE_LEVELS.vip_moderator,
    canPinPost: level >= ROLE_LEVELS.vip_moderator,
    canReviewReports: level >= ROLE_LEVELS.vip_moderator,
    // all moderators (level 1+)
    canApprovePost: level >= ROLE_LEVELS.moderator,
    canDeleteComment: level >= ROLE_LEVELS.moderator,
    canWarnUser: level >= ROLE_LEVELS.moderator,
  }
}

// ──────────────────────────────────────────────────────────────
// Global (site-wide) permissions — distinct from the profile-scoped
// system above. 4-tier hierarchy mirroring the same shape:
//   Level 4: owner            — sole account, bootstrapped via OWNER_EMAIL
//   Level 3: admin            — delete content, ban users, assign moderators,
//                                generate moderator/senior_moderator keys
//   Level 2: senior_moderator — delete comments, hide content
//   Level 1: moderator        — review reports, warn users
//
// Always a live DB read (never session-cached): a demotion must take effect
// on the very next privileged call, not wait for the user to re-authenticate.
//
// Usage:
//   const perm = await getGlobalPermission(userId)
//   if (perm.authorized && perm.canAssignModerator) { ... }
// ──────────────────────────────────────────────────────────────

export const GLOBAL_ROLE_LEVELS = {
  moderator: 1,
  senior_moderator: 2,
  admin: 3,
} as const

type GlobalRole = keyof typeof GLOBAL_ROLE_LEVELS | 'owner'

export async function getGlobalPermission(userId: string) {
  const [grant] = await db
    .select()
    .from(schema.siteRole)
    .where(eq(schema.siteRole.userId, userId))
    .limit(1)

  if (!grant) {
    return { authorized: false as const, message: 'No site-wide role for this user' }
  }

  const role = grant.role as GlobalRole
  const level = role === 'owner' ? 4 : GLOBAL_ROLE_LEVELS[role]

  return {
    authorized: true as const,
    role,
    level,
    // admin+ (level 3+)
    canDeleteContent: level >= GLOBAL_ROLE_LEVELS.admin,
    canBanUser: level >= GLOBAL_ROLE_LEVELS.admin,
    canAssignModerator: level >= GLOBAL_ROLE_LEVELS.admin,
    // senior_moderator+ (level 2+)
    canDeleteComment: level >= GLOBAL_ROLE_LEVELS.senior_moderator,
    canHideContent: level >= GLOBAL_ROLE_LEVELS.senior_moderator,
    // moderator+ (level 1+)
    canReviewReports: level >= GLOBAL_ROLE_LEVELS.moderator,
    canWarnUser: level >= GLOBAL_ROLE_LEVELS.moderator,
  }
}
