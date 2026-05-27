import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Users ─────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    githubId: text('github_id').notNull().unique(),
    email: text('email').notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    plan: text('plan').notNull().default('free'), // free | starter | pro | max
    lsCustomerId: text('ls_customer_id'),
    lsSubscriptionId: text('ls_subscription_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (t) => [index('users_github_id_idx').on(t.githubId)]
)

// ─── Projects ───────────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    schema: jsonb('schema').notNull().$type<FieldDefinition[]>(),
    allowedOrigins: text('allowed_origins')
      .array()
      .notNull()
      .default(sql`'{}'`),
    emailNotifications: boolean('email_notifications').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('projects_slug_idx').on(t.slug),
    index('projects_user_id_idx').on(t.userId),
  ]
)

// ─── Submissions ─────────────────────────────────────────────────────────────

export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    data: jsonb('data').notNull().$type<Record<string, unknown>>(),
    ipHash: text('ip_hash'), // SHA-256 of IP — never raw
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (t) => [index('submissions_project_id_idx').on(t.projectId)]
)

// ─── Refresh Tokens ──────────────────────────────────────────────────────────

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
  ]
)

// ─── Types ───────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'email' | 'number' | 'boolean' | 'textarea'

export interface FieldDefinition {
  name: string
  type: FieldType
  required: boolean
  label: string
}

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Submission = typeof submissions.$inferSelect
export type NewSubmission = typeof submissions.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
