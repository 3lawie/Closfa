// One-off script — seeds the 'general' category row that createPostWithMedia
// used to insert (onConflictDoNothing) on EVERY single publish, purely
// because post.post_category is a NOT NULL FK into categories.name. Seeding
// it once here removes that redundant per-publish DB round trip. Run once:
//   node --env-file=.env scripts/seed-categories.mjs
// (--env-file needs Node 20.6+; no dotenv dependency required.)
// Safe to re-run any time (ON CONFLICT DO NOTHING).
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set — run with: node --env-file=.env scripts/seed-categories.mjs')
  process.exit(1)
}

const sql = neon(url)

try {
  await sql`INSERT INTO categories (name) VALUES ('general') ON CONFLICT (name) DO NOTHING`
  const [row] = await sql`SELECT name FROM categories WHERE name = 'general'`
  if (row) {
    console.log("✓ 'general' category seeded successfully on this DATABASE_URL.")
  } else {
    console.error("✗ Ran without error, but the 'general' row still isn't found.")
    process.exit(1)
  }
} catch (e) {
  console.error('Failed to seed category:', e instanceof Error ? e.message : e)
  process.exit(1)
}
