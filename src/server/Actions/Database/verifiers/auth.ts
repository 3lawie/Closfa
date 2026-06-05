// ──────────────────────────────────────────────────────────────
// Auth Verifiers — simple checks used by Database services
//
// These are called INSIDE server function handlers after the
// middleware has already validated the session. They provide
// additional authorization checks (ownership, etc.)
// ──────────────────────────────────────────────────────────────

import type { SessionData } from '../../auth/session'

/** Verify the session exists and has a userId */
export function verifyIsLoggedIn(session: SessionData | null) {
  if (!session?.userId) {
    return { ok: false as const, message: 'Please log in' }
  }
  return { ok: true as const, userId: session.userId }
}

/** Verify the current user owns the resource */
export function verifyIsOwner(userId: string, resourceOwnerId: string) {
  if (userId !== resourceOwnerId) {
    return { ok: false as const, message: 'You do not own this resource' }
  }
  return { ok: true as const, userId }
}
