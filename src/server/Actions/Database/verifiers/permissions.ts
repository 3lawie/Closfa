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

import { db } from '../../../db'
import { schema } from '../../../db/schema'

const ROLE_LEVELS = {
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
    },
  })

  // Check if user is the profile owner
  const profile = await db.query.profile.findFirst({
    where: { profile_id: profileId },
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
