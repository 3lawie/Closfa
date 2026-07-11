import { db } from './src/server/db/index.js';
import { queries } from './src/server/queries.js';

async function test() {
  const posts = await queries.post.getFeed(1, 1);
  console.log(JSON.stringify(posts, null, 2));
}

test().catch(console.error);
