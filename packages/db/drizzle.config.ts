import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
// Drizzle commands run in packages/db; load env files from repo root.
config({ path: '../../.env.local' })
config({ path: '../../.env' })

export default defineConfig({
  schema: './src/schema.ts',
  out: './src/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
