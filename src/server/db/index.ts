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
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { schema } from './schema'
import * as relations from './relations'

export const db = drizzle(process.env.DATABASE_URL!, { schema: { ...schema, ...relations } })
