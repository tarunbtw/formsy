import { Hono } from 'hono'
import { Polar } from '@polar-sh/sdk'
import { createHmac, timingSafeEqual } from 'crypto'
import { db, users } from '../../../../packages/db/src/index.ts'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const billingRouter = new Hono()

function getPolar() {
  const token = process.env.POLAR_ACCESS_TOKEN
  if (!token) throw new Error('POLAR_ACCESS_TOKEN is required')
  return new Polar({ accessToken: token })
}

const PRODUCT_MAP: Record<string, string | undefined> = {
  starter: process.env.POLAR_PRODUCT_ID_STARTER,
  pro:     process.env.POLAR_PRODUCT_ID_PRO,
  max:     process.env.POLAR_PRODUCT_ID_MAX,
}

function resolvePlan(productId: string): string {
  for (const [plan, id] of Object.entries(PRODUCT_MAP)) {
    if (id && id === productId) return plan
  }
  return 'free'
}

// ─── GET /api/billing/checkout?plan=starter|pro|max ───────────────────────────

billingRouter.get('/checkout', authMiddleware, async (c) => {
  const plan = c.req.query('plan')
  const { userId } = c.get('user')

  if (!plan || !PRODUCT_MAP[plan]) {
    return c.json({ error: 'invalid_plan' }, 400)
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return c.json({ error: 'user_not_found' }, 404)

  const productId = PRODUCT_MAP[plan]!

  try {
    const polar = getPolar()
    const checkout = await polar.checkouts.create({
      productId,
      customerEmail: user.email ?? undefined,
      metadata: { user_id: userId },
      successUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/dashboard/settings?upgraded=true`,
    })

    return c.json({ checkoutUrl: checkout.url })
  } catch (err) {
    console.error('[BILLING] Checkout error:', err)
    return c.json({ error: 'checkout_failed' }, 502)
  }
})

// ─── GET /api/billing/portal ──────────────────────────────────────────────────

billingRouter.get('/portal', authMiddleware, async (c) => {
  const { userId } = c.get('user')

  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.lsCustomerId) {
    return c.json({ error: 'no_subscription' }, 404)
  }

  try {
    const polar = getPolar()
    const session = await polar.customerSessions.create({
      customerId: user.lsCustomerId,
    })

    return c.json({ portalUrl: session.customerPortalUrl })
  } catch (err) {
    console.error('[BILLING] Portal error:', err)
    return c.json({ error: 'portal_failed' }, 502)
  }
})

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// No auth — verify HMAC-SHA256 signature from Polar

billingRouter.post('/webhook', async (c) => {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET
  if (!webhookSecret) {
    return c.json({ error: 'webhook_not_configured' }, 503)
  }

  const rawBody = await c.req.text()
  const signature = c.req.header('webhook-signature') ?? ''

  if (!signature) {
    return c.json({ error: 'missing_signature' }, 401)
  }

  // Verify HMAC-SHA256 — timing-safe comparison
  const expected = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  const sigBuffer = Buffer.from(signature)
  const expBuffer = Buffer.from(expected)

  if (
    sigBuffer.length !== expBuffer.length ||
    !timingSafeEqual(sigBuffer, expBuffer)
  ) {
    console.warn('[BILLING] Webhook signature mismatch')
    return c.json({ error: 'invalid_signature' }, 401)
  }

  let event: {
    type: string
    data: {
      id: string
      customerId?: string
      productId?: string
      metadata?: { user_id?: string }
    }
  }

  try {
    event = JSON.parse(rawBody)
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  console.log(`[BILLING] Polar webhook: ${event.type}`)

  const meta = event.data.metadata ?? {}
  const userId = meta.user_id

  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated': {
      if (!userId) break

      const planName = event.data.productId
        ? resolvePlan(event.data.productId)
        : 'starter'

      await db
        .update(users)
        .set({
          plan: planName,
          lsCustomerId: event.data.customerId ?? null,
          lsSubscriptionId: event.data.id,
        })
        .where(eq(users.id, userId))

      console.log(`[BILLING] ✓ Set user ${userId} plan → ${planName}`)
      break
    }

    case 'subscription.canceled':
    case 'subscription.revoked': {
      if (!userId) break

      await db
        .update(users)
        .set({ plan: 'free' })
        .where(eq(users.id, userId))

      console.log(`[BILLING] ✓ Reverted user ${userId} → free`)
      break
    }

    default:
      console.log(`[BILLING] Unhandled Polar event: ${event.type}`)
  }

  return c.json({ received: true })
})
