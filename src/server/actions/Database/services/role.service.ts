// ──────────────────────────────────────────────────────────────
// Global (site-wide) role management: one-time redeemable admin/moderator
// keys, and direct moderator assignment. Distinct from moderation.service.ts's
// profile-scoped assignModerator — see permissions.ts for the two hierarchies.
//
// No interactive transactions on this driver (neon-http, see db/index.ts) —
// redeemRoleKeyFn's two writes are deliberately ordered claim-first-grant-
// second rather than wrapped in a transaction; see the comment inline.
// ──────────────────────────────────────────────────────────────

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware, rateLimiterMiddleWare, rateLimiterMiddlewareFor } from '@/server/lib/middleware'
import { db } from '@/server/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { schema } from '@/server/db/schema'
import { getGlobalPermission, GLOBAL_ROLE_LEVELS } from '../verifiers/permissions'
import { ok, err, type ServerResult } from '@/server/lib/result'
import { logger } from '@/server/lib/logger'
import { createId } from '@paralleldrive/cuid2'
import {
  generateRoleKeyValidation,
  redeemRoleKeyValidation,
  revokeGlobalRoleValidation,
  assignGlobalModeratorValidation,
} from '@/verification/role.validation'

type KeyGrantableRole = 'admin' | 'senior_moderator' | 'moderator'

/** BASE64URL encoding (no padding, URL-safe chars) — mirrors auth0.ts's PKCE helper. */
function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Cosmetic label only — visibly signals what the key grants. Authorization
// never trusts this; redemption always re-reads `role` off the roleGrant row.
const ROLE_PREFIX: Record<KeyGrantableRole, string> = {
  admin: 'ADM',
  senior_moderator: 'SRMOD',
  moderator: 'MOD',
}

// The current viewer's own global-permission flags — the one server fn every
// privileged UI surface (settings, nickname search, post option menu) calls
// to decide whether to render an admin/moderator action at all. Server-side
// handlers never trust this for authorization; each still re-derives its own
// getGlobalPermission from the session.
export const getMyGlobalPermissionFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .handler(async ({ context }) => {
    return await getGlobalPermission(context.session.userId)
  })

export const generateRoleKeyFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(generateRoleKeyValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ id: string; code: string }>> => {
    const { userId } = context.session
    const { role } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to generate a role key')
      }

      // Privilege escalation guard, same shape as moderation.service.ts's
      // assignModerator: you may only generate a key for a role STRICTLY
      // below your own level (admin can mint moderator/senior_moderator keys;
      // only owner can mint admin keys).
      if (perm.level <= GLOBAL_ROLE_LEVELS[role]) {
        return err('FORBIDDEN', 'You cannot generate a key for a role equal to or above your own')
      }

      const secret = new Uint8Array(32)
      crypto.getRandomValues(secret)
      const code = base64UrlEncode(secret)
      const codeHash = await sha256Hex(code)
      const id = createId()

      await db.insert(schema.roleGrant).values({
        id,
        codeHash,
        codePrefix: ROLE_PREFIX[role],
        role,
        createdBy: userId,
      })

      // The plaintext code is returned exactly once here — only its hash is
      // ever stored, so it cannot be recovered if lost. `id` lets the caller
      // poll getRoleKeyStatusFn later to see whether it's been redeemed.
      return ok({ id, code: `${ROLE_PREFIX[role]}-${code}` })
    } catch (e) {
      logger.error('generateRoleKey failed', { userId, role }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to generate role key')
    }
  })

/** Redemption status for a key this caller generated — powers the "used?" indicator in the admin UI. */
export const getRoleKeyStatusFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<ServerResult<{ redeemed: boolean }>> => {
    const { userId } = context.session

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to check this key')
      }

      const [grant] = await db.select({ redeemedAt: schema.roleGrant.redeemedAt, createdBy: schema.roleGrant.createdBy })
        .from(schema.roleGrant)
        .where(eq(schema.roleGrant.id, data.id))
        .limit(1)

      if (!grant || grant.createdBy !== userId) {
        return err('NOT_FOUND', 'Key not found')
      }

      return ok({ redeemed: grant.redeemedAt !== null })
    } catch (e) {
      logger.error('getRoleKeyStatus failed', { userId, id: data.id }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to check key status')
    }
  })

export const redeemRoleKeyFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddlewareFor('roleRedeem')])
  .inputValidator(redeemRoleKeyValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ role: string }>> => {
    const { userId } = context.session
    // Strip the cosmetic "PREFIX-" label — the stored hash was computed over
    // the raw random code only, at generation time.
    const rawCode = data.code.includes('-') ? data.code.slice(data.code.indexOf('-') + 1) : data.code

    try {
      const existing = await db.select().from(schema.siteRole).where(eq(schema.siteRole.userId, userId)).limit(1)
      if (existing.length > 0) {
        return err('BAD_REQUEST', 'You already have a site role')
      }

      const codeHash = await sha256Hex(rawCode)

      // Atomic claim: single UPDATE...RETURNING, race-safe by itself — this
      // MUST be the only statement guarding single-use redemption, since this
      // driver has no interactive transactions to wrap it with the grant below.
      const [claimed] = await db.update(schema.roleGrant)
        .set({ redeemedBy: userId, redeemedAt: new Date() })
        .where(and(
          eq(schema.roleGrant.codeHash, codeHash),
          isNull(schema.roleGrant.redeemedAt),
          gt(schema.roleGrant.expiresAt, new Date()),
        ))
        .returning()

      if (!claimed) {
        return err('BAD_REQUEST', 'This key is invalid, expired, or already used')
      }

      try {
        await db.insert(schema.siteRole).values({
          id: createId(),
          userId,
          role: claimed.role,
          assignedBy: claimed.createdBy,
        })
      } catch (grantError) {
        // The code is already claimed and must NOT be un-claimed (that would
        // reopen the single-use race for a different caller). Rare ops
        // incident, not a routine path — log loudly for manual recovery.
        logger.error(
          'redeemRoleKey: claim succeeded but grant failed',
          { userId, grantId: claimed.id, role: claimed.role },
          grantError instanceof Error ? grantError : undefined,
        )
        return err('INTERNAL_ERROR', 'Failed to apply the role after claiming the key — contact support')
      }

      await db.insert(schema.auditLog).values({
        actorId: userId,
        action: 'assign_role',
        targetType: 'user',
        targetId: userId,
        reason: `Redeemed role key for ${claimed.role}`,
      })

      return ok({ role: claimed.role })
    } catch (e) {
      logger.error('redeemRoleKey failed', { userId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to redeem role key')
    }
  })

export const revokeGlobalRoleFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(revokeGlobalRoleValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ targetUserId: string }>> => {
    const { userId } = context.session
    const { targetUserId } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to revoke a role')
      }

      const [target] = await db.select().from(schema.siteRole).where(eq(schema.siteRole.userId, targetUserId)).limit(1)
      if (!target) {
        return err('BAD_REQUEST', 'That user has no site role to revoke')
      }
      // No endpoint-driven path to zero owners.
      if (target.role === 'owner') {
        return err('FORBIDDEN', 'The owner role cannot be revoked')
      }

      if (perm.level <= GLOBAL_ROLE_LEVELS[target.role]) {
        return err('FORBIDDEN', 'You cannot revoke a role equal to or above your own')
      }

      await db.delete(schema.siteRole).where(eq(schema.siteRole.userId, targetUserId))

      await db.insert(schema.auditLog).values({
        actorId: userId,
        action: 'revoke_role',
        targetType: 'user',
        targetId: targetUserId,
        reason: `Revoked role ${target.role}`,
      })

      return ok({ targetUserId })
    } catch (e) {
      logger.error('revokeGlobalRole failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to revoke role')
    }
  })

// Direct moderator assignment (no key) — for the two "make moderator" UI
// entry points (nickname search, post option menu). Admin promotion stays
// key-only; this is deliberately narrower (moderator/senior_moderator only).
export const assignGlobalModeratorFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(assignGlobalModeratorValidation)
  .handler(async ({ data, context }): Promise<ServerResult<{ targetUserId: string; level: string }>> => {
    const { userId } = context.session
    const { targetUserId, level } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to assign a moderator')
      }

      if (perm.level <= GLOBAL_ROLE_LEVELS[level]) {
        return err('FORBIDDEN', 'You cannot assign a role equal to or above your own')
      }

      const [existing] = await db.select().from(schema.siteRole).where(eq(schema.siteRole.userId, targetUserId)).limit(1)

      if (existing) {
        // Only touch users strictly below your own level — this path is for
        // promoting ordinary users, not for reshuffling existing privileged
        // ones (that belongs to revokeGlobalRoleFn + a fresh grant).
        if (existing.role === 'owner' || perm.level <= GLOBAL_ROLE_LEVELS[existing.role]) {
          return err('FORBIDDEN', 'You cannot modify a role equal to or above your own')
        }
        await db.update(schema.siteRole)
          .set({ role: level, assignedAt: new Date(), assignedBy: userId })
          .where(eq(schema.siteRole.userId, targetUserId))
      } else {
        await db.insert(schema.siteRole).values({
          id: createId(),
          userId: targetUserId,
          role: level,
          assignedBy: userId,
        })
      }

      await db.insert(schema.auditLog).values({
        actorId: userId,
        action: 'assign_role',
        targetType: 'user',
        targetId: targetUserId,
        reason: `Assigned global role ${level}`,
      })

      return ok({ targetUserId, level })
    } catch (e) {
      logger.error('assignGlobalModerator failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to assign moderator')
    }
  })

/**
 * Manual admin-only verification grant/revoke — mirrors every other
 * privileged toggle in this file: reuses the global-role permission system
 * rather than any criteria-based/automatic path.
 */
export const setVerifiedFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, rateLimiterMiddleWare])
  .inputValidator(z.object({ targetUserId: z.string().min(1), verified: z.boolean() }))
  .handler(async ({ data, context }): Promise<ServerResult<{ targetUserId: string; verified: boolean }>> => {
    const { userId } = context.session
    const { targetUserId, verified } = data

    try {
      const perm = await getGlobalPermission(userId)
      if (!perm.authorized || !perm.canAssignModerator) {
        return err('FORBIDDEN', 'Insufficient permissions to verify a user')
      }

      const [updated] = await db.update(schema.profile)
        .set({ isVerified: verified, updatedAt: new Date() })
        .where(eq(schema.profile.userId, targetUserId))
        .returning({ profile_id: schema.profile.profile_id })

      if (!updated) return err('NOT_FOUND', 'That user has no profile to verify')

      await db.insert(schema.auditLog).values({
        actorId: userId,
        action: 'verify_user',
        targetType: 'user',
        targetId: targetUserId,
        reason: verified ? 'Granted verification' : 'Revoked verification',
      })

      return ok({ targetUserId, verified })
    } catch (e) {
      logger.error('setVerified failed', { userId, targetUserId }, e instanceof Error ? e : undefined)
      return err('INTERNAL_ERROR', 'Failed to update verification status')
    }
  })
