import { drizzle } from 'drizzle-orm/neon-http'

const db = drizzle("postgresql://neondb_owner:npg_0IEToHjl6yFW@ep-shiny-wave-a2tsb91w-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

async function main() {
  await db.execute('ALTER TABLE "user" ALTER COLUMN "nickname" DROP NOT NULL')
  console.log("Database updated successfully!")
}

main().catch(console.error)
