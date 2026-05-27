import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db, users, refreshTokens } from '../../../../packages/db/src/index.ts'
import { eq, and, gt } from 'drizzle-orm'
import {
  SignJWT,
  jwtVerify,
  type JWTPayload,
} from 'jose'
import { createHash, randomBytes } from 'crypto'

export const authRouter = new Hono()

// ─── Env helpers ─────────────────────────────────────────────────────────────

function getSecret(key: string) {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return new TextEncoder().encode(val)
}

const GITHUB_CLIENT_ID = () => process.env.GITHUB_CLIENT_ID!
const GITHUB_CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET!
const GITHUB_CALLBACK_URL = () =>
  process.env.GITHUB_CALLBACK_URL ?? 'http://localhost:3001/auth/github/callback'
const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173'

// ─── JWT helpers ─────────────────────────────────────────────────────────────

export interface JwtUserPayload extends JWTPayload {
  userId: string
  plan: string
}

export async function signAccessToken(payload: { userId: string; plan: string }) {
  return new SignJWT({ userId: payload.userId, plan: payload.plan })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret('JWT_SECRET'))
}

export async function verifyAccessToken(token: string): Promise<JwtUserPayload> {
  const { payload } = await jwtVerify(token, getSecret('JWT_SECRET'))
  return payload as JwtUserPayload
}

async function signRefreshToken() {
  const raw = randomBytes(48).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

async function verifyRefreshToken(raw: string) {
  const hash = createHash('sha256').update(raw).digest('hex')
  const [token] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, hash),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
  return token ?? null
}

// ─── GitHub OAuth helpers ─────────────────────────────────────────────────────

interface GithubTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

interface GithubUser {
  id: number
  login: string
  name: string | null
  avatar_url: string
  email: string | null
}

interface GithubEmail {
  email: string
  primary: boolean
  verified: boolean
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID(),
      client_secret: GITHUB_CLIENT_SECRET(),
      code,
      redirect_uri: GITHUB_CALLBACK_URL(),
    }),
  })
  const data = (await res.json()) as GithubTokenResponse
  if (!data.access_token) throw new Error('GitHub token exchange failed')
  return data.access_token
}

async function getGithubUser(accessToken: string): Promise<GithubUser> {
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Formsy' },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Formsy' },
    }),
  ])
  const user = (await userRes.json()) as GithubUser
  const emailList = (await emailsRes.json()) as GithubEmail[]
  // Prefer primary verified email
  const primary = emailList.find((e) => e.primary && e.verified)
  user.email = primary?.email ?? user.email
  return user
}

// ─── Route: GET /auth/github ──────────────────────────────────────────────────

authRouter.get('/github', (c) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID(),
    redirect_uri: GITHUB_CALLBACK_URL(),
    scope: 'user:email',
  })
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

// ─── Route: GET /auth/github/callback ────────────────────────────────────────

authRouter.get('/github/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')

  if (error || !code) {
    return c.redirect(`${FRONTEND_URL()}/?auth_error=access_denied`)
  }

  try {
    // 1. Exchange code for GitHub access token
    const githubToken = await exchangeCodeForToken(code)

    // 2. Fetch GitHub user profile
    const githubUser = await getGithubUser(githubToken)
    if (!githubUser.email) {
      return c.redirect(`${FRONTEND_URL()}/?auth_error=no_email`)
    }

    // 3. Upsert user in DB
    const [user] = await db
      .insert(users)
      .values({
        githubId: String(githubUser.id),
        email: githubUser.email,
        name: githubUser.name ?? githubUser.login,
        avatarUrl: githubUser.avatar_url,
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          email: githubUser.email,
          name: githubUser.name ?? githubUser.login,
          avatarUrl: githubUser.avatar_url,
        },
      })
      .returning()

    // 4. Issue JWT access token
    const accessToken = await signAccessToken({ userId: user.id, plan: user.plan })

    // 5. Issue refresh token, store hash in DB
    const { raw: refreshTokenRaw, hash: refreshTokenHash } = await signRefreshToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    })

    // 6. Set refresh token as httpOnly cookie
    setCookie(c, 'refresh_token', refreshTokenRaw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    // 7. Redirect to dashboard with access token in URL fragment (memory storage)
    return c.redirect(
      `${FRONTEND_URL()}/dashboard?token=${encodeURIComponent(accessToken)}`
    )
  } catch (err) {
    console.error('[AUTH] GitHub callback error:', err)
    return c.redirect(`${FRONTEND_URL()}/?auth_error=server_error`)
  }
})

// ─── Route: POST /auth/refresh ────────────────────────────────────────────────

authRouter.post('/refresh', async (c) => {
  const rawToken = getCookie(c, 'refresh_token')
  if (!rawToken) {
    return c.json({ error: 'no_refresh_token' }, 401)
  }

  const tokenRecord = await verifyRefreshToken(rawToken)
  if (!tokenRecord) {
    deleteCookie(c, 'refresh_token')
    return c.json({ error: 'invalid_or_expired_refresh_token' }, 401)
  }

  // Fetch user to get latest plan
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, tokenRecord.userId))

  if (!user) {
    return c.json({ error: 'user_not_found' }, 401)
  }

  const accessToken = await signAccessToken({ userId: user.id, plan: user.plan })

  return c.json({ accessToken })
})

// ─── Route: POST /auth/logout ─────────────────────────────────────────────────

authRouter.post('/logout', async (c) => {
  const rawToken = getCookie(c, 'refresh_token')

  if (rawToken) {
    const hash = createHash('sha256').update(rawToken).digest('hex')
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hash))
  }

  deleteCookie(c, 'refresh_token', { path: '/' })
  return c.json({ ok: true })
})

// ─── Route: GET /auth/me ──────────────────────────────────────────────────────
// Returns the current user info from the access token

authRouter.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const payload = await verifyAccessToken(token)
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        plan: users.plan,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
    if (!user) return c.json({ error: 'user_not_found' }, 404)
    return c.json(user)
  } catch {
    return c.json({ error: 'invalid_token' }, 401)
  }
})
