/**
 * Server-only environment variables — NEVER import this file from client code.
 *
 * In Cloudflare Workers, these come from wrangler secrets (.dev.vars locally).
 * In other environments, they come from process.env.
 */
export const serverEnv = {
  databaseUrl: process.env.DATABASE_URL!,
  imagekitPrivateKey: process.env.IMAGEKIT_PRIVATE_KEY!,
  auth0Domain: process.env.AUTH0_DOMAIN!,
  auth0ClientId: process.env.AUTH0_CLIENT_ID!,
  auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET!,
  sessionSecret: process.env.SESSION_SECRET!,
}
