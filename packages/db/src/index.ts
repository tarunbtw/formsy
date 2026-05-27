import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const queryClient = postgres(process.env.DATABASE_URL)

export const db = drizzle(queryClient, { schema })

export {
  users,
  projects,
  submissions,
  refreshTokens,
} from './schema'

export type {
  FieldType,
  FieldDefinition,
  User,
  NewUser,
  Project,
  NewProject,
  Submission,
  NewSubmission,
  RefreshToken,
  NewRefreshToken,
} from './schema'
