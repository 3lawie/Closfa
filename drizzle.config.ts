import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Relational Queries v2 and Casing configuration
  casing: 'snake_case', // Allows using camelCase in TS and snake_case in Postgres automatically
  strict: true,
  verbose: true,
});