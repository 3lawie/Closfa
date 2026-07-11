import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Runs tests inside the real workerd runtime (via Miniflare), not a Node
// mock of it — see DESIGN_PATTERNS.md pattern 9. This makes invariant 6
// (edge runtime only, no Node-only APIs) an enforced fact: a test that
// reaches for a Node-only API fails the same way production would.
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    // Vitest's default include glob would otherwise also pick up unrelated
    // fixture "tests" vendored under superpowers-main/ at the repo root.
    include: ['src/**/*.test.ts'],
  },
})
