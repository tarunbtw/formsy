import { Hono } from 'hono'
import { db, submissions, projects } from '../../../../packages/db/src/index.ts'
import { eq, and, desc, count, sql } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const submissionsRouter = new Hono()

submissionsRouter.use('*', authMiddleware)

// ─── GET /api/projects/:id/submissions ────────────────────────────────────────

submissionsRouter.get('/', async (c) => {
  const { userId } = c.get('user')
  const projectId = c.req.param('id')

  // Verify project ownership
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))

  if (!project) return c.json({ error: 'not_found' }, 404)

  const page = Math.max(1, Number(c.req.query('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)))
  const offset = (page - 1) * limit

  const [{ total }] = await db
    .select({ total: count() })
    .from(submissions)
    .where(eq(submissions.projectId, projectId))

  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.projectId, projectId))
    .orderBy(desc(submissions.createdAt))
    .limit(limit)
    .offset(offset)

  return c.json({
    submissions: rows,
    total: Number(total),
    page,
    limit,
    totalPages: Math.ceil(Number(total) / limit),
  })
})

// ─── PATCH /api/projects/:id/submissions/:sid/read ────────────────────────────

submissionsRouter.patch('/:sid/read', async (c) => {
  const { userId } = c.get('user')
  const projectId = c.req.param('id')
  const sid = c.req.param('sid')

  // Verify project ownership
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))

  if (!project) return c.json({ error: 'not_found' }, 404)

  const [updated] = await db
    .update(submissions)
    .set({ isRead: true })
    .where(and(eq(submissions.id, sid), eq(submissions.projectId, projectId)))
    .returning()

  if (!updated) return c.json({ error: 'not_found' }, 404)

  return c.json(updated)
})
