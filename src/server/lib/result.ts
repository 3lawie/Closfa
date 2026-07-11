import { type ZodIssue } from 'zod'

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'

/**
 * Wire-safe validation issue. Zod's own issue type carries `input: unknown`,
 * which TanStack's server-fn serialization validator rejects (and leaking the
 * raw invalid input to the client is undesirable anyway) — so results carry
 * only the path and message.
 */
export type ValidationIssue = { path: string; message: string }

export const toValidationIssues = (issues: ZodIssue[]): ValidationIssue[] =>
  issues.map((i) => ({ path: i.path.join('.'), message: i.message }))

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string; issues?: ValidationIssue[] }

/**
 * Constructors for the two arms — services use these instead of hand-writing
 * literals, so the discriminant is always `true`/`false` (not widened to
 * `boolean`) without needing `as const` at every return site.
 */
export const ok = <T>(data: T): ServerResult<T> => ({ ok: true, data })

export const err = (
  error: ErrorCode,
  message: string,
  issues?: ValidationIssue[],
): ServerResult<never> => (issues ? { ok: false, error, message, issues } : { ok: false, error, message })
