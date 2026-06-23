// ──────────────────────────────────────────────────────────────
// Auth Verifiers — simple checks used by Database services
//
// These are called INSIDE server function handlers after the
// middleware has already validated the session. They provide
// additional authorization checks (ownership, etc.)
// ──────────────────────────────────────────────────────────────


/** Verify the current user owns the resource */
export function verifyIsOwner(userId: string, resourceOwnerId: string) {
  if (userId !== resourceOwnerId) {
    return { ok: false as const, message: 'You do not own this resource' }
  }
  return { ok: true as const, userId }
}
