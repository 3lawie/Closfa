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
    tsconfigPaths(),
    tailwindcss(),
  ],
  server: {
    // "to read" is vendored reference material (other projects, kept around
    // for manual reading only) — not part of this app, so the dev server's
    // file watcher shouldn't walk or react to changes inside it.
    watch: { ignored: ['**/to read/**'] },
  },
})

