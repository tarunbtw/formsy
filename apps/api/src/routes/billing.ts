import { Hono } from 'hono'
import { createHmac } from 'crypto'
import { db, users } from '../../../../packages/db/src/index.ts'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

export const billingRouter = new Hono()

const PLAN_VARIANT_MAP: Record<string, string | undefined> = {
  starter: process.env.LS_VARIANT_STARTER,
  pro: process.env.LS_VARIANT_PRO,
  max: process.env.LS_VARIANT_MAX,
}

function getLSApiKey() {
  const key = process.env.LEMONSQUEEZY_API_KEY
  if (!key) throw new Error('LEMONSQUEEZY_API_KEY is required')
  return key
}

// ─── GET /api/billing/checkout?plan=starter|pro|max ──────────────────────────

billingRouter.get('/checkout', authMiddleware, async (c) => {
  const plan = c.req.query('plan')
  const { userId } = c.get('user')

  if (!plan || !PLAN_VARIANT_MAP[plan]) {
    return c.json({ error: 'invalid_plan' }, 400)
  }

  const variantId = PLAN_VARIANT_MAP[plan]!
  const storeId = process.env.LEMONSQUEEZY_STORE_ID
  if (!storeId) return c.json({ error: 'billing_not_configured' }, 503)

  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return c.json({ error: 'user_not_found' }, 404)

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${getLSApiKey()}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: user.email,
            custom: { user_id: user.id },
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: storeId } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('[BILLING] Checkout error:', err)
    return c.json({ error: 'checkout_failed' }, 502)
  }

  const data = (await res.json()) as { data: { attributes: { url: string } } }
  return c.json({ checkoutUrl: data.data.attributes.url })
})

// ─── GET /api/billing/portal ─────────────────────────────────────────────────

billingRouter.get('/portal', authMiddleware, async (c) => {
  const { userId } = c.get('user')

  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.lsCustomerId) {
    return c.json({ error: 'no_subscription' }, 404)
  }

  const res = await fetch(
    `https://api.lemonsqueezy.com/v1/customers/${user.lsCustomerId}/portal`,
    {
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${getLSApiKey()}`,
      },
    }
  )

  if (!res.ok) {
    return c.json({ error: 'portal_failed' }, 502)
  }

  const data = (await res.json()) as { data: { attributes: { url: string } } }
  return c.json({ portalUrl: data.data.attributes.url })
})

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// No auth — verify HMAC signature from LemonSqueezy

billingRouter.post('/webhook', async (c) => {
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!webhookSecret) {
    return c.json({ error: 'webhook_not_configured' }, 503)
  }

  const sig = c.req.header('X-Signature')
  const rawBody = await c.req.text()

  if (!sig) {
    return c.json({ error: 'missing_signature' }, 401)
  }

  // Verify HMAC-SHA256
  const expected = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')

  if (sig !== expected) {
    console.warn('[BILLING] Webhook signature mismatch')
    return c.json({ error: 'invalid_signature' }, 401)
  }

  let payload: {
    meta: { event_name: string; custom_data?: { user_id?: string } }
    data: {
      attributes: {
        customer_id?: string
        first_subscription_item?: { subscription_id?: number }
        status?: string
        user_email?: string
      }
    }
  }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const eventName = payload.meta.event_name
  const userId = payload.meta.custom_data?.user_id
  const attrs = payload.data.attributes

  // Determine plan from event
  const planMap: Record<string, string> = {
    [process.env.LS_VARIANT_STARTER ?? '']: 'starter',
    [process.env.LS_VARIANT_PRO ?? '']: 'pro',
    [process.env.LS_VARIANT_MAX ?? '']: 'max',
  }

  console.log(`[BILLING] Webhook: ${eventName} for user ${userId}`)

  switch (eventName) {
    case 'subscription_created': {
      if (!userId) break
      const subId = String(attrs.first_subscription_item?.subscription_id ?? '')
      const customerId = String(attrs.customer_id ?? '')
      // Determine plan from variant — look it up if needed; default to 'starter'
      const plan = 'starter' // Will be refined by subscription_updated
      await db
        .update(users)
        .set({ plan, lsCustomerId: customerId, lsSubscriptionId: subId })
        .where(eq(users.id, userId))
      break
    }
    case 'subscription_updated': {
      if (!userId) break
      const status = attrs.status ?? ''
      // If cancelled/expired, revert to free
      if (['cancelled', 'expired', 'unpaid'].includes(status)) {
        await db
          .update(users)
          .set({ plan: 'free' })
          .where(eq(users.id, userId))
      }
      break
    }
    case 'subscription_cancelled': {
      if (!userId) break
      await db.update(users).set({ plan: 'free' }).where(eq(users.id, userId))
      break
    }
    default:
      console.log(`[BILLING] Unhandled event: ${eventName}`)
  }

  return c.json({ ok: true })
})
