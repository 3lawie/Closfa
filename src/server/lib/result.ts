import { type ZodIssue } from 'zod'

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'

export type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string; issues?: ZodIssue[] }
