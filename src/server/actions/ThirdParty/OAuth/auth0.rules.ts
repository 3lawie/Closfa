// ──────────────────────────────────────────────────────────────
// Pure auth-flow rules — NO framework imports (testable standalone under the
// Workers test pool; see src/server/lib/session.rules.ts for the pattern).
// ──────────────────────────────────────────────────────────────

/**
 * Open-redirect guard for the post-login returnTo path.
 *
 * Accepts ONLY a same-origin relative path: starts with exactly one '/',
 * no protocol-relative '//' form, no backslashes (browsers normalize '\'
 * to '/', so '/\evil.com' becomes '//evil.com'), nothing URL-parseable
 * with its own origin/scheme, and a sane length cap for the state cookie.
 *
 * Returns the safe path, or null for anything suspicious — callers fall
 * back to '/'.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.length > 512) return null
  // Reject ASCII control chars FIRST: the WHATWG URL parser strips tab/CR/LF
  // before parsing, so `/\t/evil.com` passes the relative-path checks below
  // yet the browser resolves it cross-origin from the Location header.
  // Matching control characters is the entire point of this guard; the rule
  // exists to catch the ones written by accident.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//')) return null
  if (raw.includes('\\')) return null
  try {
    // A relative path must NOT parse as an absolute URL. If this succeeds,
    // raw smuggled in a scheme (https:, javascript:, data:, ...).
    new URL(raw)
    return null
  } catch {
    // Unparseable without a base = genuinely relative. Good.
  }
  return raw
}
