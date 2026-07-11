import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_0IEToHjl6yFW@ep-shiny-wave-a2tsb91w-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

async function test() {
  const posts = await sql`SELECT p.post_id, p.content, json_agg(m.*) as media FROM post p LEFT JOIN post_to_media pm ON p.post_id = pm.post_id LEFT JOIN media m ON m.media_id = pm.media_id GROUP BY p.post_id, p.content`;
  console.log(JSON.stringify(posts, null, 2));
}

test();
