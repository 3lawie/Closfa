// ──────────────────────────────────────────────────────────────
// Pure rate-limit rules — NO framework imports (see session.rules.ts for why).
// ──────────────────────────────────────────────────────────────

/**
 * Rate-limit identifier derivation. Logged-in users are keyed per-user;
 * anonymous callers by IP+UA composite.
 */
export function identifierFor(
  session: { userId: string } | null,
  request: { headers: { get(name: string): string | null } } | null,
): string {
  if (session?.userId) {
    return `user:${session.userId}`
  }
  if (request) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown-ip'
    const userAgent = request.headers.get('user-agent') || 'unknown-ua'
    return `anon:${ip}:${userAgent}`
  }
  return 'anonymous'
}
