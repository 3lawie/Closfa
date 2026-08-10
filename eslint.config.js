import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['.next', 'dist', 'src/routeTree.gen.ts', 'to read', 'superpowers-main']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Server code and build scripts don't run in a browser. Without this they
    // were linted against browser globals only, so `process`, `Buffer` and
    // friends registered as undefined while `window`/`document` looked valid.
    files: ['src/server/**/*.{ts,tsx}', 'scripts/**/*.mjs', '*.mjs', '*.config.{js,ts}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Drizzle ORM v1.0.0-beta.23 types relational-callback params as
    // Table<any> — the columns genuinely aren't in the type (see the header
    // comment in queries.ts). Contextual inference and never-typed bags were
    // both tried and neither compiles; `any` is the actual workaround, so it's
    // acknowledged here in one place rather than by nine inline disables that
    // would drift out of date. Scoped to this file so a stray `any` anywhere
    // else still fails the build.
    files: ['src/server/queries.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
