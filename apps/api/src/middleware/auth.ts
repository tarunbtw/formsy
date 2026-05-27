import type { MiddlewareHandler } from 'hono'
import { verifyAccessToken, type JwtUserPayload } from '../routes/auth'

// Augment Hono context with user variable
declare module 'hono' {
  interface ContextVariableMap {
    user: JwtUserPayload
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const payload = await verifyAccessToken(token)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ error: 'invalid_or_expired_token' }, 401)
  }
}
