// One-off script — backfills `keywords` for already-published posts that
// have none (published before this session's filename-keyword-extraction
// feature existed, or whose background enrichPostForSearch job never
// produced anything — see postEnrichment.ts). Computes keywords from each
// post's attached media's original file_name using the same pure function
// post.service.ts now runs at publish time — no AI calls, no network I/O
// beyond the database, safe to run repeatedly (only touches rows where
// keywords IS NULL or empty).
//
// Run (Node 20.6+ for --env-file; --experimental-strip-types to import the
// real .ts extraction module directly rather than duplicating its logic):
//   node --env-file=.env --experimental-strip-types scripts/backfill-keywords.mjs
// Safe to delete after it succeeds, or re-run any time.
import { neon } from '@neondatabase/serverless'
import { extractKeywordsFromFilenames } from '../src/lib/text/filenameKeywords.ts'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set — run with: node --env-file=.env --experimental-strip-types scripts/backfill-keywords.mjs')
  process.exit(1)
}
const sql = neon(url)

const posts = await sql`
  SELECT post_id FROM post
  WHERE is_published = true AND (keywords IS NULL OR array_length(keywords, 1) IS NULL)
`
console.log(`Found ${posts.length} published post(s) with no keywords.`)

let updated = 0
for (const { post_id } of posts) {
  const mediaRows = await sql`
    SELECT m.file_name
    FROM post_to_media ptm
    JOIN media m ON m.media_id = ptm.media_id
    WHERE ptm.post_id = ${post_id}
  `
  if (mediaRows.length === 0) continue

  const keywords = extractKeywordsFromFilenames(mediaRows.map((m) => m.file_name))
  if (keywords.length === 0) continue

  await sql`UPDATE post SET keywords = ${keywords} WHERE post_id = ${post_id}`
  updated++
  console.log(`  ${post_id}: ${JSON.stringify(keywords)}`)
}

console.log(`Updated ${updated} of ${posts.length} post(s).`)
