import { Hono } from 'hono'
import { db, projects, submissions, users } from '../../../../packages/db/src/index.ts'
import { eq } from 'drizzle-orm'
import { createHash } from 'crypto'
import { z } from 'zod'
import { getPlanLimits } from '../../../../packages/schemas/src/index.ts'
import {
  checkIpRateLimit,
  getMonthlySubmissionCount,
  incrementMonthlySubmissionCount,
} from '../lib/redis'
import { getBoss } from '../jobs/index'
import type { FieldDefinition } from '../../../../packages/db/src/index.ts'

export const submitRouter = new Hono()

// ─── Dynamic Zod schema builder ───────────────────────────────────────────────

function buildZodSchema(fields: FieldDefinition[]): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {}
  for (const f of fields) {
    let zField: z.ZodTypeAny
    if (f.type === 'email') zField = z.string().email()
    else if (f.type === 'number') zField = z.coerce.number()
    else if (f.type === 'boolean') zField = z.coerce.boolean()
    else zField = z.string().min(1)

    shape[f.name] = f.required ? zField : zField.optional()
  }
  return z.object(shape).strip() as z.ZodObject<z.ZodRawShape>
}

// ─── POST /submit/:slug ───────────────────────────────────────────────────────

submitRouter.post('/:slug', async (c) => {
  const slug = c.req.param('slug')

  // 1. Look up project by slug
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))

  if (!project) {
    return c.json({ error: 'not_found' }, 404)
  }

  // 2. CORS check — if allowedOrigins is non-empty, validate Origin header
  if (project.allowedOrigins && project.allowedOrigins.length > 0) {
    const origin = c.req.header('Origin') ?? ''
    if (!project.allowedOrigins.includes(origin)) {
      return c.json({ error: 'origin_not_allowed' }, 403)
    }
  }

  // 3. Rate limit — per IP
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0'
  const ipAllowed = await checkIpRateLimit(ip)
  if (!ipAllowed) {
    return c.json({ error: 'rate_limit_exceeded' }, 429)
  }

  // 4. Check monthly quota against plan limits — join to get owner's plan + userId
  const [projectWithOwner] = await db
    .select({ plan: users.plan, userId: users.id })
    .from(projects)
    .innerJoin(users, eq(projects.userId, users.id))
    .where(eq(projects.id, project.id))

  const plan = projectWithOwner?.plan ?? 'free'
  const userId = projectWithOwner?.userId ?? project.id
  const limits = getPlanLimits(plan)
  const monthlyCount = await getMonthlySubmissionCount(userId)

  if (monthlyCount >= limits.submissions_per_month) {
    return c.json({ error: 'quota_exceeded' }, 429)
  }

  // 5. Content-Type check
  const contentType = c.req.header('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'content_type_must_be_json' }, 415)
  }

  // 6. Payload size check (50KB)
  const contentLength = Number(c.req.header('Content-Length') ?? 0)
  if (contentLength > 50 * 1024) {
    return c.json({ error: 'payload_too_large' }, 413)
  }

  // 7. Parse body
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  // 8. Honeypot check — silently discard bot submissions
  if (body._honeypot && String(body._honeypot).trim() !== '') {
    return c.json({ ok: true, id: 'honeypot' })
  }

  // 9. Validate against project schema
  const zodSchema = buildZodSchema(project.schema as FieldDefinition[])
  const parsed = zodSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      {
        error: 'validation_failed',
        fields: parsed.error.flatten().fieldErrors,
      },
      422
    )
  }

  // 10. Store submission (IP as SHA-256 hash)
  const ipHash = createHash('sha256').update(ip).digest('hex')

  const [submission] = await db
    .insert(submissions)
    .values({
      projectId: project.id,
      data: parsed.data,
      ipHash,
    })
    .returning()

  // 11. Increment monthly quota in Redis (keyed by userId)
  await incrementMonthlySubmissionCount(userId)

  // 12. Enqueue email job (non-blocking)
  try {
    const boss = getBoss()
    if (boss) {
      await boss.send('send-submission-email', {
        submissionId: submission.id,
        projectId: project.id,
      })
    }
  } catch (err) {
    console.error('[SUBMIT] Failed to enqueue email job:', err)
    // Don't fail the request — email is best-effort
  }

  // 13. Always respond fast
  return c.json({ ok: true, id: submission.id })
})
