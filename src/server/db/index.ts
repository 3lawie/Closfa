// ──────────────────────────────────────────────────────────────
// Neon Serverless + Drizzle ORM — HTTP driver for Cloudflare Workers
//
// Why neon-http instead of postgres-js?
// 1. Uses standard fetch() → works in Cloudflare Workers (no TCP sockets)
// 2. Each query is a single HTTP request → no connection pool needed
// 3. Serverless: scales to zero, no idle connections burning Neon compute
//
// Trade-off: no interactive transactions (use neon-serverless WebSocket driver if needed)
// ──────────────────────────────────────────────────────────────
import { drizzle } from 'drizzle-orm/neon-http'
import { schema } from './schema'
import { relations } from './relations'

// Use a Proxy to lazily initialize Drizzle.
// In Cloudflare Workers, process.env bindings are injected per-request,
// so process.env.DATABASE_URL is undefined at the module's top-level scope.
let _db: ReturnType<typeof drizzle>;

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop, receiver) {
    if (!_db) {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set in the environment.");
      }
      _db = drizzle(process.env.DATABASE_URL, { schema, relations });
    }
    const value = Reflect.get(_db, prop, receiver);
    return typeof value === 'function' ? value.bind(_db) : value;
  }
});
