import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load from apps/api/.env when DATABASE_URL isn't already set
if (!process.env.DATABASE_URL) {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  config({ path: resolve(__dirname, '../../apps/api/.env') })
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for drizzle-kit')
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
