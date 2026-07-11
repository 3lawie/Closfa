// ──────────────────────────────────────────────────────────────
// Pure session rules — NO framework imports. session.ts consumes these;
// tests import this module directly (the framework-glue module can't be
// loaded standalone under the Workers test pool because @tanstack/react-start
// uses app-build-only #subpath imports).
// ──────────────────────────────────────────────────────────────

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7 // 7 days
export const ABSOLUTE_CAP_SECONDS = 30 * 24 * 60 * 60 // 30 days — forces re-auth regardless of activity
export const RENEWAL_THRESHOLD_SECONDS = SESSION_DURATION_SECONDS * 0.25

/**
 * Pure expiry/renewal decision for a decrypted session payload — the
 * sliding-window rules, unit-testable without JWE or request context.
 * getSession() maps 'renew' to an actual re-mint + status 'renewed'.
 */
export function evaluateSessionPayload(
  session: { issuedAt: number; expiresAt: number },
  nowSeconds: number,
): 'valid' | 'renew' | 'expired' {
  if (nowSeconds - session.issuedAt > ABSOLUTE_CAP_SECONDS) return 'expired'
  if (session.expiresAt < nowSeconds) return 'expired'
  if (session.expiresAt - nowSeconds < RENEWAL_THRESHOLD_SECONDS) return 'renew'
  return 'valid'
}
