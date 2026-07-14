// Custom Worker entry — replaces wrangler's previous `main` of the package
// export `@tanstack/react-start/server-entry`, which only exports `{ fetch }`
// (confirmed by reading its resolved file: dist/default-entry/esm/server.js).
// A Cloudflare Cron Trigger needs a `scheduled()` export alongside `fetch`,
// so this file reconstructs the same `fetch` handler from the same building
// blocks TanStack's own default entry uses, then adds `scheduled`.
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'
import { purgeExpiredRemovedPosts } from './server/lib/purgePost'
import { logger } from './server/lib/logger'

const fetch = createStartHandler(defaultStreamHandler)

async function scheduled(_event: ScheduledEvent, _env: unknown, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(
    purgeExpiredRemovedPosts()
      .then(({ purged, failed }) => {
        if (purged > 0 || failed > 0) logger.info('scheduled purge run complete', { purged, failed })
      })
      .catch((e) => logger.error('scheduled purge run failed', undefined, e instanceof Error ? e : undefined)),
  )
}

export default { fetch, scheduled }
