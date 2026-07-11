/**
 * Client-safe environment variables.
 * These are safe to expose to the browser.
 *
 * Read via `import.meta.env`, not `process.env`: Vite statically inlines
 * `VITE_`-prefixed vars into both the client and SSR bundles at build time.
 * `process.env` doesn't exist in the browser at all, so reading these
 * through `process.env` (the previous approach) silently fell through to
 * a hardcoded fallback on every browser load — see DESIGN_PATTERNS.md
 * pattern 8.
 */
import { z } from 'zod'

const clientEnvSchema = z.object({
  VITE_PUBLIC_IMAGEKIT_PUBLIC_KEY: z.string().min(1, 'VITE_PUBLIC_IMAGEKIT_PUBLIC_KEY is required'),
  VITE_PUBLIC_IMAGEKIT_URL_ENDPOINT: z.string().min(1, 'VITE_PUBLIC_IMAGEKIT_URL_ENDPOINT is required'),
  VITE_PUBLIC_AUTH0_DOMAIN: z.string().min(1, 'VITE_PUBLIC_AUTH0_DOMAIN is required'),
  VITE_PUBLIC_AUTH0_CLIENT_ID: z.string().min(1, 'VITE_PUBLIC_AUTH0_CLIENT_ID is required'),
})

// Parsed once at module load: unlike server secrets, these are build-time
// constants inlined by Vite, so they're always present by the time this
// module evaluates — no per-request laziness needed (contrast server-env.ts).
const parsed = clientEnvSchema.safeParse(import.meta.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid client environment configuration:\n${issues}`)
}

export const clientEnv = {
  imagekitPublicKey: parsed.data.VITE_PUBLIC_IMAGEKIT_PUBLIC_KEY,
  imagekitUrlEndpoint: parsed.data.VITE_PUBLIC_IMAGEKIT_URL_ENDPOINT,
  auth0Domain: parsed.data.VITE_PUBLIC_AUTH0_DOMAIN,
  auth0ClientId: parsed.data.VITE_PUBLIC_AUTH0_CLIENT_ID,
}
