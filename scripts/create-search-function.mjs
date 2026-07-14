// One-off script — creates the closfa_post_tsvector() helper function that
// src/server/db/schema.ts's postSearchIndex needs, against the EXACT same
// DATABASE_URL drizzle.config.ts (and the app itself) uses. Run once:
//   node --env-file=.env scripts/create-search-function.mjs
// (--env-file needs Node 20.6+; no dotenv dependency required.)
// Safe to delete after it succeeds, or re-run any time (CREATE OR REPLACE).
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set — run with: node --env-file=.env scripts/create-search-function.mjs')
  process.exit(1)
}

const sql = neon(url)

try {
  // neon()'s result is only callable as a tagged template (sql`...`), not as
  // a plain function with a string argument — this has no interpolated
  // values, so the template literal is just the whole statement verbatim.
  await sql`
    CREATE OR REPLACE FUNCTION closfa_post_tsvector(p_content text, p_keywords text[])
    RETURNS tsvector AS $$
      SELECT to_tsvector('english', coalesce(p_content, '') || ' ' || coalesce(array_to_string(p_keywords, ' '), ''));
    $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
  `
  const [row] = await sql`SELECT proname FROM pg_proc WHERE proname = 'closfa_post_tsvector'`
  if (row) {
    console.log('✓ closfa_post_tsvector() created successfully on this DATABASE_URL.')
  } else {
    console.error('✗ Ran without error, but the function still isn\'t found — check search_path/schema.')
    process.exit(1)
  }
} catch (e) {
  console.error('Failed to create function:', e instanceof Error ? e.message : e)
  process.exit(1)
}
