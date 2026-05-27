import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db, projects, submissions } from '../../../../packages/db/src/index.ts'
import { eq, and, count, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { CreateProjectSchema, UpdateProjectSchema, getPlanLimits } from '../../../../packages/schemas/src/index.ts'
import { authMiddleware } from '../middleware/auth'
import { getMonthlySubmissionCount } from '../lib/redis'

export const projectsRouter = new Hono()

// All routes require auth
projectsRouter.use('*', authMiddleware)

// Build endpoint URL from the incoming request so it always reflects the
// actual host — localhost:3001 in dev, api.formsy.dev in prod, etc.
// Override with API_BASE_URL env var when running behind a reverse proxy.
function endpointUrl(slug: string, c: { req: { url: string; header(name: string): string | undefined } }) {
  const override = process.env.API_BASE_URL
  if (override) return `${override.replace(/\/$/, '')}/submit/${slug}`
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}/submit/${slug}`
}

// ─── GET /api/projects/usage ────────────────────────────────────────────────
// Returns the user's current usage vs plan limits for the settings page

projectsRouter.get('/usage', async (c) => {
  const { userId, plan } = c.get('user')
  const limits = getPlanLimits(plan)

  // Count active forms
  const [{ value: formCount }] = await db
    .select({ value: count() })
    .from(projects)
    .where(eq(projects.userId, userId))

  // Monthly submission count from Redis (keyed by userId)
  const monthlySubmissions = await getMonthlySubmissionCount(userId)

  return c.json({
    forms: { used: Number(formCount), limit: limits.projects },
    submissions: { used: monthlySubmissions, limit: limits.submissions_per_month },
  })
})

// ─── GET /api/projects ────────────────────────────────────────────────────────

projectsRouter.get('/', async (c) => {
  const { userId } = c.get('user')

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      schema: projects.schema,
      allowedOrigins: projects.allowedOrigins,
      emailNotifications: projects.emailNotifications,
      createdAt: projects.createdAt,
      submissionCount: count(submissions.id),
    })
    .from(projects)
    .leftJoin(submissions, eq(submissions.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .groupBy(projects.id)
    .orderBy(sql`${projects.createdAt} DESC`)

  return c.json(
    rows.map((p) => ({
      ...p,
      submissionCount: Number(p.submissionCount),
      endpoint_url: endpointUrl(p.slug, c),
    }))
  )
})

// ─── POST /api/projects ───────────────────────────────────────────────────────

projectsRouter.post(
  '/',
  zValidator('json', CreateProjectSchema),
  async (c) => {
    const { userId, plan } = c.get('user')
    const body = c.req.valid('json')

    // Check plan project limit
    const limits = getPlanLimits(plan)
    const [{ value: projectCount }] = await db
      .select({ value: count() })
      .from(projects)
      .where(eq(projects.userId, userId))

    if (projectCount >= limits.projects) {
      return c.json(
        {
          error: 'plan_limit_exceeded',
          message: `Your ${plan} plan allows up to ${limits.projects} projects. Upgrade to create more.`,
        },
        403
      )
    }

    // Generate unique slug
    let slug = nanoid(10)
    let attempts = 0
    while (attempts < 3) {
      const [existing] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.slug, slug))
      if (!existing) break
      slug = nanoid(10)
      attempts++
    }

    const [project] = await db
      .insert(projects)
      .values({
        userId,
        name: body.name,
        slug,
        schema: body.schema,
        allowedOrigins: body.allowed_origins,
        emailNotifications: body.email_notifications,
      })
      .returning()

    return c.json({ ...project, endpoint_url: endpointUrl(project.slug, c) }, 201)
  }
)

// ─── GET /api/projects/:id ────────────────────────────────────────────────────

projectsRouter.get('/:id', async (c) => {
  const { userId } = c.get('user')
  const id = c.req.param('id')

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))

  if (!project) return c.json({ error: 'not_found' }, 404)

  const [{ value: submissionCount }] = await db
    .select({ value: count() })
    .from(submissions)
    .where(eq(submissions.projectId, id))

  return c.json({
    ...project,
    endpoint_url: endpointUrl(project.slug, c),
    submission_count: Number(submissionCount),
  })
})

// ─── PATCH /api/projects/:id ──────────────────────────────────────────────────

projectsRouter.patch(
  '/:id',
  zValidator('json', UpdateProjectSchema),
  async (c) => {
    const { userId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    // Verify ownership
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))

    if (!existing) return c.json({ error: 'not_found' }, 404)

    const updateData: Partial<typeof projects.$inferInsert> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.schema !== undefined) updateData.schema = body.schema
    if (body.allowed_origins !== undefined) updateData.allowedOrigins = body.allowed_origins
    if (body.email_notifications !== undefined)
      updateData.emailNotifications = body.email_notifications

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, id))
      .returning()

    return c.json({ ...updated, endpoint_url: endpointUrl(updated.slug, c) })
  }
)

// ─── DELETE /api/projects/:id ─────────────────────────────────────────────────

projectsRouter.delete('/:id', async (c) => {
  const { userId } = c.get('user')
  const id = c.req.param('id')

  const [existing] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))

  if (!existing) return c.json({ error: 'not_found' }, 404)

  await db.delete(projects).where(eq(projects.id, id))

  return c.json({ ok: true })
})
