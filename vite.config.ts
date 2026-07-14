import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    react(),
    // Explicit `projects` disables crawling for tsconfig.json files — without
    // it, this plugin walks the whole workspace root and trips over the many
    // tsconfig.json files vendored under "to read/" (reference material, not
    // part of this app — see .gitignore/eslint.config.js/vite server.watch).
    tsconfigPaths({ projects: ['tsconfig.json'] }),
    tailwindcss(),
  ],
  server: {
    // "to read" is vendored reference material (other projects, kept around
    // for manual reading only) — not part of this app, so the dev server's
    // file watcher shouldn't walk or react to changes inside it.
    watch: { ignored: ['**/to read/**'] },
  },
})

