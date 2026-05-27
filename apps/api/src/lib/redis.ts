import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

export function getRedis(): Redis {
  if (_redis) return _redis

  const url = process.env.REDIS_URL
  const token = process.env.REDIS_TOKEN

  if (!url || !token) {
    throw new Error('REDIS_URL and REDIS_TOKEN environment variables are required')
  }

  _redis = new Redis({ url, token })
  return _redis
}

// ─── Rate limit helpers ───────────────────────────────────────────────────────

export async function checkIpRateLimit(ip: string): Promise<boolean> {
  const redis = getRedis()
  const key = `rl:ip:${ip}`
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, 60) // 1 minute window
  }
  return count <= 60 // 60 req/min per IP
}

export async function getMonthlySubmissionCount(userId: string): Promise<number> {
  const redis = getRedis()
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const key = `quota:user:${userId}:${month}`
  const val = await redis.get<number>(key)
  return val ?? 0
}

export async function incrementMonthlySubmissionCount(userId: string): Promise<void> {
  const redis = getRedis()
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const key = `quota:user:${userId}:${month}`

  const count = await redis.incr(key)
  if (count === 1) {
    // Set expiry to end of month + 1 day buffer
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 2)
    const secondsUntilExpiry = Math.floor((endOfMonth.getTime() - now.getTime()) / 1000)
    await redis.expire(key, secondsUntilExpiry)
  }
}
