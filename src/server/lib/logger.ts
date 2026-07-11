// ──────────────────────────────────────────────────────────────
// Structured logger — edge-safe (Web APIs only, no Node imports).
//
// One JSON line per call via the matching console method, so Workers
// log drains / `wrangler tail` get parseable, greppable records instead
// of interpolated strings. Replaces raw console.error in server code.
// ──────────────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const isLogLevel = (value: string): value is LogLevel => value in LEVEL_PRIORITY

// Read lazily per call, not at module top: on Cloudflare Workers the
// nodejs_compat flag populates process.env per-request, so it's empty at
// module-evaluation time (same constraint server-env.ts documents).
function threshold(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase()
  return raw && isLogLevel(raw) ? raw : 'info'
}

function emit(
  level: LogLevel,
  msg: string,
  context?: Record<string, unknown>,
  errInfo?: Record<string, unknown>,
): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[threshold()]) return
  const payload: Record<string, unknown> = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(context ?? {}),
    ...(errInfo ?? {}),
  }
  console[level](JSON.stringify(payload))
}

export const logger = {
  debug(msg: string, context?: Record<string, unknown>): void {
    emit('debug', msg, context)
  },
  info(msg: string, context?: Record<string, unknown>): void {
    emit('info', msg, context)
  },
  warn(msg: string, context?: Record<string, unknown>): void {
    emit('warn', msg, context)
  },
  error(msg: string, context?: Record<string, unknown>, err?: Error): void {
    emit(
      'error',
      msg,
      context,
      err ? { errName: err.name, errMessage: err.message, errStack: err.stack } : undefined,
    )
  },
}
