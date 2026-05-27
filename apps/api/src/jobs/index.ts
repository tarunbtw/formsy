import PgBoss from 'pg-boss'
import { db, submissions, projects, users } from '../../../../packages/db/src/index.ts'
import { eq } from 'drizzle-orm'
import { sendEmail, buildSubmissionEmail } from '../lib/email'

let boss: PgBoss | null = null

export function getBoss(): PgBoss | null {
  return boss
}

interface SubmissionEmailJob {
  submissionId: string
  projectId: string
}

export async function initJobs(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.warn('[JOBS] DATABASE_URL not set — job queue disabled')
    return
  }

  boss = new PgBoss({
    connectionString: dbUrl,
    retryLimit: 3,
    retryDelay: 60, // 60 seconds between retries
    retryBackoff: true,
  })

  boss.on('error', (err) => console.error('[PG-BOSS]', err))

  await boss.start()
  console.log('[JOBS] pg-boss started')

  // ─── Worker: send-submission-email ─────────────────────────────────────────
  await boss.work<SubmissionEmailJob>(
    'send-submission-email',
    { teamSize: 5, teamConcurrency: 2 },
    async (job) => {
      const { submissionId, projectId } = job.data

      try {
        // Fetch submission
        const [submission] = await db
          .select()
          .from(submissions)
          .where(eq(submissions.id, submissionId))

        if (!submission) {
          console.warn(`[EMAIL JOB] Submission ${submissionId} not found`)
          return
        }

        // Fetch project
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))

        if (!project) {
          console.warn(`[EMAIL JOB] Project ${projectId} not found`)
          return
        }

        // Check if notifications enabled
        if (!project.emailNotifications) {
          console.log(`[EMAIL JOB] Notifications disabled for project ${projectId}`)
          return
        }

        // Fetch project owner
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, project.userId))

        if (!user?.email) {
          console.warn(`[EMAIL JOB] No email for user of project ${projectId}`)
          return
        }

        // Build and send email
        const { subject, html } = buildSubmissionEmail({
          projectName: project.name,
          projectId: project.id,
          data: submission.data as Record<string, unknown>,
          submittedAt: submission.createdAt,
        })

        await sendEmail({ to: user.email, subject, html })

        console.log(
          `[EMAIL JOB] ✓ Sent to ${user.email} for submission ${submissionId}`
        )
      } catch (err) {
        console.error(`[EMAIL JOB] ✗ Failed for submission ${submissionId}:`, err)
        // Re-throw so pg-boss retries (up to retryLimit)
        throw err
      }
    }
  )

  console.log('[JOBS] Registered worker: send-submission-email')
}
