/**
 * Server-only environment variables — NEVER import this file from client code.
 *
 * In Cloudflare Workers, these come from wrangler secrets (.dev.vars locally).
 * In other environments, they come from process.env.
 */
import { z } from 'zod'

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1, 'IMAGEKIT_PRIVATE_KEY is required'),
  AUTH0_DOMAIN: z.string().min(1, 'AUTH0_DOMAIN is required'),
  AUTH0_CLIENT_ID: z.string().min(1, 'AUTH0_CLIENT_ID is required'),
  AUTH0_CLIENT_SECRET: z.string().min(1, 'AUTH0_CLIENT_SECRET is required'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
})

type RawServerEnv = z.infer<typeof serverEnvSchema>

function parseServerEnv(): RawServerEnv {
  const result = serverEnvSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid server environment configuration:\n${issues}`)
  }
  return result.data
}

// Lazy + memoized, not eager-at-import: Cloudflare Workers inject secrets
// per-request (compat flag `nodejs_compat_populate_process_env` in
// wrangler.jsonc populates `process.env` from the request's `env` bindings),
// so `process.env` is empty at true module-evaluation time — the same
// constraint the `db` Proxy in `src/server/db/index.ts` works around.
// Parsing eagerly here would throw on every cold start before any request
// context exists. Each getter below triggers (and memoizes) the Zod parse
// on first access, which always happens inside a request.
let _parsed: RawServerEnv | undefined

function env(): RawServerEnv {
  if (!_parsed) {
    _parsed = parseServerEnv()
  }
  return _parsed
}

export const serverEnv = {
  get databaseUrl() {
    return env().DATABASE_URL
  },
  get imagekitPrivateKey() {
    return env().IMAGEKIT_PRIVATE_KEY
  },
  get auth0Domain() {
    return env().AUTH0_DOMAIN
  },
  get auth0ClientId() {
    return env().AUTH0_CLIENT_ID
  },
  get auth0ClientSecret() {
    return env().AUTH0_CLIENT_SECRET
  },
  get sessionSecret() {
    return env().SESSION_SECRET
  },
}
