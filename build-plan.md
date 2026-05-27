# Formsy — Agent Build Plan

> Form backend SaaS. Dev defines schema → gets endpoint → posts from any site → sees submissions in dashboard → gets email alert.
> This document is the single source of truth for building Formsy. Follow phase order. No deviation.

---

## Stack

| Layer | Choice |
|---|---|
| Backend runtime | Node.js 20 |
| Backend framework | Hono |
| Database | PostgreSQL (Neon or Supabase) |
| ORM | Drizzle ORM |
| Job queue | pg-boss (runs on same Postgres) |
| Cache / rate limit | Upstash Redis (REST SDK) |
| Email | Resend (primary) · Brevo (fallback) |
| Auth | GitHub OAuth (manual, no Clerk) |
| Sessions | JWT (15 min access) + httpOnly refresh cookie (7 days) |
| Billing | LemonSqueezy |
| Frontend | React 18 + Vite |
| UI components | shadcn/ui |
| Data fetching | TanStack Query v5 |
| Routing | React Router v6 |
| Validation | Zod (shared between front and back) |
| CDN snippet | Vanilla JS UMD bundle (esbuild) |
| Monorepo | pnpm workspaces |

---

## Repo Structure

```
formsy/
├── apps/
│   ├── api/          # Hono backend
│   └── web/          # React frontend
├── packages/
│   ├── db/           # Drizzle schema + migrations
│   ├── schemas/      # Shared Zod schemas
│   └── sdk/          # Vanilla JS CDN bundle
├── .env.example
├── pnpm-workspace.yaml
└── turbo.json        # optional, use if adding Turborepo
```

---

## Environment Variables

```env
# apps/api/.env

DATABASE_URL=
REDIS_URL=
REDIS_TOKEN=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback

JWT_SECRET=
JWT_REFRESH_SECRET=

RESEND_API_KEY=
BREVO_API_KEY=

LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=

FRONTEND_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

---

## Database Schema (`packages/db`)

### Tables

```ts
// users
id            uuid PK default gen_random_uuid()
github_id     text UNIQUE NOT NULL
email         text UNIQUE NOT NULL
name          text
avatar_url    text
plan          text NOT NULL default 'free'   // free | starter | pro | max
ls_customer_id  text                         // LemonSqueezy customer id
ls_subscription_id text
created_at    timestamptz default now()

// projects
id            uuid PK default gen_random_uuid()
user_id       uuid FK → users.id ON DELETE CASCADE
name          text NOT NULL
slug          text UNIQUE NOT NULL            // used in endpoint URL
schema        jsonb NOT NULL                 // array of field definitions
allowed_origins text[]  default '{}'         // CORS allowlist
email_notifications boolean default true
created_at    timestamptz default now()

// submissions
id            uuid PK default gen_random_uuid()
project_id    uuid FK → projects.id ON DELETE CASCADE
data          jsonb NOT NULL
ip_hash       text                           // SHA-256 of IP, never raw
is_read       boolean default false
created_at    timestamptz default now()

// refresh_tokens
id            uuid PK default gen_random_uuid()
user_id       uuid FK → users.id ON DELETE CASCADE
token_hash    text UNIQUE NOT NULL
expires_at    timestamptz NOT NULL
created_at    timestamptz default now()
```

### Schema definition (field object shape in `projects.schema`)
```ts
// stored in projects.schema jsonb as an array
{
  name: string       // field key, e.g. "email"
  type: "text" | "email" | "number" | "boolean" | "textarea"
  required: boolean
  label: string      // display label
}
```

### Migrations
- Use `drizzle-kit generate` and `drizzle-kit migrate`
- Migration files live in `packages/db/migrations/`

---

## Phase 1 — Repo Bootstrap

**Goal:** Monorepo running, DB connected, health check endpoint live.

### Steps

1. Init pnpm workspace. Create `pnpm-workspace.yaml` listing `apps/*` and `packages/*`.
2. Create `packages/db`:
   - Install: `drizzle-orm`, `drizzle-kit`, `postgres`
   - Write all table schemas in `schema.ts`
   - Export `db` client (uses `DATABASE_URL`)
   - Run first migration
3. Create `apps/api`:
   - Install: `hono`, `@hono/node-server`, `zod`, `dotenv`
   - `src/index.ts` → starts server, mounts `GET /health` returning `{ ok: true }`
4. Create `apps/web`:
   - `pnpm create vite` with React + TypeScript template
   - Install: `shadcn/ui` (init), `@tanstack/react-query`, `react-router-dom`, `axios`
5. Confirm: `GET /health` returns 200, frontend loads.

---

## Phase 2 — Auth (GitHub OAuth + JWT)

**Goal:** User can log in with GitHub. JWT issued. Refresh token stored.

### Backend (`apps/api/src/routes/auth.ts`)

#### Flow
```
GET /auth/github
  → redirect to https://github.com/login/oauth/authorize?client_id=...&scope=user:email

GET /auth/github/callback?code=...
  → POST https://github.com/login/oauth/access_token  (exchange code)
  → GET https://api.github.com/user  (fetch profile)
  → upsert user in DB (match on github_id)
  → issue accessToken (JWT, 15min, payload: { userId, plan })
  → issue refreshToken (random 48-char hex, hash it, store in refresh_tokens table)
  → set refreshToken as httpOnly Secure SameSite=Strict cookie
  → redirect to FRONTEND_URL/dashboard

POST /auth/refresh
  → read cookie → hash it → look up in refresh_tokens → check expiry
  → issue new accessToken
  → return { accessToken }

POST /auth/logout
  → delete refresh_token row from DB
  → clear cookie
```

#### Middleware
- `authMiddleware`: extract `Authorization: Bearer <token>` → verify JWT → attach `ctx.user = { userId, plan }` to context
- All non-public routes use this middleware

### Frontend
- `GET /auth/github` button → redirects to backend
- On return to `/dashboard`, frontend calls `POST /auth/refresh` to get access token
- Store access token in memory only (not localStorage). On tab refresh, call `/auth/refresh` once on mount.
- Axios interceptor: on 401, call `/auth/refresh`, retry once, else redirect to login.

---

## Phase 3 — Projects CRUD

**Goal:** Authenticated user can create, list, update, delete projects and get their endpoint URL.

### Routes (`apps/api/src/routes/projects.ts`)

All routes require `authMiddleware`.

```
GET    /projects              → list all projects for user
POST   /projects              → create project
GET    /projects/:id          → get single project (must own it)
PATCH  /projects/:id          → update name, schema, allowed_origins, email_notifications
DELETE /projects/:id          → delete project + cascade submissions
```

### POST /projects — validation
```ts
// Zod schema (packages/schemas/project.ts)
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(80),
  schema: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(["text","email","number","boolean","textarea"]),
    required: z.boolean(),
    label: z.string().min(1),
  })).min(1).max(20),
  allowed_origins: z.array(z.string().url()).max(10).default([]),
  email_notifications: z.boolean().default(true),
})
```

### Plan limits — enforce on POST /projects
```ts
const PROJECT_LIMITS = { free: 2, starter: 5, pro: 15, max: Infinity }

// Before insert: count existing projects for user. If >= limit → 403
```

### Slug generation
- `slug = nanoid(10)` — used in submission endpoint URL
- Check uniqueness before insert, retry once if collision

### Endpoint URL format
```
POST https://api.formsy.dev/submit/<slug>
```
- Return this in the project response as `endpoint_url`

---

## Phase 4 — Submission Endpoint

**Goal:** Public endpoint receives form data, validates against schema, stores it, queues email job.

### Route (`apps/api/src/routes/submit.ts`)

```
POST /submit/:slug
```

**No auth required. This is the public-facing endpoint.**

### Steps in handler

1. **Look up project** by slug. If not found → 404.
2. **CORS check**: if `allowed_origins` is non-empty, check `Origin` header is in list. If not → 403. If empty → allow all (dev mode).
3. **Rate limit** (Upstash Redis):
   - Global: 60 req/min per IP (key: `rl:ip:<ip>`)
   - Per project: check monthly submission count against plan limit (key: `quota:<projectId>:<YYYY-MM>`)
   - If over quota → 429 with `{ error: "quota_exceeded" }`
4. **Payload check**: reject if Content-Type is not `application/json`. Reject if body > 50KB.
5. **Honeypot check**: if body contains field `_honeypot` with non-empty value → silently return 200 (discard).
6. **Validate against schema**: use project's stored schema to build a Zod schema dynamically. Strip unknown keys. If required fields missing → 422 with field errors.
7. **Store submission**: insert into `submissions` with `ip_hash = sha256(ip)`.
8. **Increment quota counter** in Redis (INCR with expiry set to end of month).
9. **Enqueue email job** via pg-boss: `boss.send('send-submission-email', { submissionId, projectId })`.
10. **Return** `{ ok: true, id: submissionId }` — always fast, email is async.

### Dynamic Zod schema builder
```ts
function buildZodSchema(fields: Field[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    let z_field: z.ZodTypeAny
    if (f.type === 'email')    z_field = z.string().email()
    else if (f.type === 'number') z_field = z.number()
    else if (f.type === 'boolean') z_field = z.boolean()
    else z_field = z.string().min(1)
    shape[f.name] = f.required ? z_field : z_field.optional()
  }
  return z.object(shape).strip()
}
```

---

## Phase 5 — Email Notifications

**Goal:** When a submission arrives, project owner gets an email with submission data.

### pg-boss setup (`apps/api/src/jobs/index.ts`)
- Initialize pg-boss with `DATABASE_URL` on server start
- Register worker: `boss.work('send-submission-email', handler)`

### Worker handler
1. Fetch submission + project + user (owner) from DB.
2. If `project.email_notifications === false` → skip.
3. Build email HTML (simple table of field: value pairs).
4. Try Resend first. If Resend throws, fall back to Brevo.
5. Log success or failure. Do not throw — a failed email must not be retried infinitely. Max 3 retries via pg-boss config.

### Email content
```
Subject: New submission on [project name]

You got a new submission on your form "[project name]".

Field       Value
--------    --------
name        John Doe
email       john@example.com
message     Hello there

View it at: https://formsy.dev/dashboard/projects/<id>/submissions

— Formsy
```

---

## Phase 6 — Dashboard Frontend

**Goal:** Full working UI. Login, projects, schema builder, submissions inbox.

### Pages & routes

```
/                     → landing / login page
/dashboard            → project list
/dashboard/projects/new          → create project
/dashboard/projects/:id          → project detail: endpoint URL + schema view
/dashboard/projects/:id/submissions  → submissions inbox
/dashboard/settings              → account + billing
```

### Components to build

**ProjectList** — cards with project name, submission count, endpoint URL copy button.

**ProjectForm** — create/edit. Fields: name, schema builder (add/remove fields, set type, required toggle), allowed origins input, email notification toggle.

**SchemaBuilder** — drag-to-reorder list of field rows. Each row: field name input, type select, required toggle, delete button.

**SubmissionsTable** — paginated table. Columns: date, read/unread dot, data preview. Click row → expand full data. Mark as read. Export CSV button.

**EndpointDisplay** — read-only code block showing the endpoint URL + example fetch snippet. Copy button.

**BillingCard** — current plan, usage (submissions this month / limit), upgrade button → LemonSqueezy checkout URL.

### API calls
- All calls include `Authorization: Bearer <accessToken>` header.
- On 401, interceptor calls `/auth/refresh` once before failing.

---

## Phase 7 — Billing (LemonSqueezy)

**Goal:** User can upgrade plan. Webhooks update plan in DB.

### Plans — LemonSqueezy product setup

Create 3 paid variants in LemonSqueezy dashboard:
| Plan | Price | Variant ID (store in env) |
|---|---|---|
| Starter | $7/mo | `LS_VARIANT_STARTER` |
| Pro | $10/mo | `LS_VARIANT_PRO` |
| Max | $30/mo | `LS_VARIANT_MAX` |

### Routes (`apps/api/src/routes/billing.ts`)

```
GET /billing/checkout?plan=starter|pro|max
  → create LemonSqueezy checkout URL via API
  → return { checkoutUrl }
  → frontend redirects user to it

GET /billing/portal
  → get LemonSqueezy customer portal URL for user
  → return { portalUrl }

POST /billing/webhook  (no auth, verify signature)
  → handle events:
    - subscription_created → set user.plan, user.ls_subscription_id
    - subscription_updated → update user.plan
    - subscription_cancelled → set user.plan = 'free'
```

### Webhook verification
```ts
// Verify X-Signature header from LemonSqueezy
import { createHmac } from 'crypto'
const sig = req.header('X-Signature')
const body = await req.text()
const expected = createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET).update(body).digest('hex')
if (sig !== expected) return ctx.json({ error: 'invalid signature' }, 401)
```

### Checkout URL creation
```ts
// POST https://api.lemonsqueezy.com/v1/checkouts
{
  data: {
    type: "checkouts",
    attributes: {
      checkout_data: {
        email: user.email,
        custom: { user_id: user.id }
      }
    },
    relationships: {
      store: { data: { type: "stores", id: STORE_ID } },
      variant: { data: { type: "variants", id: variantId } }
    }
  }
}
```

---

## Phase 8 — Plan Enforcement

**Goal:** Enforce project and submission limits per plan at the API level.

### Limits table (keep in one place: `packages/schemas/limits.ts`)
```ts
export const PLAN_LIMITS = {
  free:    { projects: 2,        submissions_per_month: 100 },
  starter: { projects: 5,        submissions_per_month: 10_000 },
  pro:     { projects: 15,       submissions_per_month: 35_000 },
  max:     { projects: Infinity, submissions_per_month: 100_000 },
}
```

### Enforcement points
- **POST /projects**: check project count against `PLAN_LIMITS[user.plan].projects`
- **POST /submit/:slug**: check monthly submission counter in Redis against `PLAN_LIMITS[plan].submissions_per_month`
- **Max plan overage**: submissions beyond 100K are allowed but counted. Charge via LemonSqueezy usage records (or invoice manually at first — don't overbuild).

---

## Phase 9 — Vanilla JS CDN Snippet (`packages/sdk`)

**Goal:** Any website can use `Formsy.submit()` without a framework.

### Build
- Entry: `src/index.ts`
- Build with esbuild to `dist/formsy.min.js` (UMD, target ES2017, < 5KB gzipped)

### API surface
```js
// Drop in HTML
<script src="https://cdn.formsy.dev/v1/formsy.min.js"></script>

// Usage
Formsy.submit('your-slug', {
  name: 'Jane',
  email: 'jane@example.com',
  message: 'Hello'
})
.then(res => console.log('submitted', res))
.catch(err => console.error(err))
```

### Implementation (< 50 lines)
```ts
const BASE = 'https://api.formsy.dev'

async function submit(slug: string, data: Record<string, unknown>) {
  const res = await fetch(`${BASE}/submit/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) throw json
  return json
}

export const Formsy = { submit }

// UMD global
if (typeof window !== 'undefined') (window as any).Formsy = Formsy
```

### Test
- Create a plain HTML file, include the CDN script, submit a form, confirm it hits the API and email arrives.

---

## Phase 10 — npx CLI (`packages/cli`)

**Goal:** `npx @formsy/init` scaffolds a framework-specific component.

### Behavior
```
$ npx @formsy/init

? Pick your framework:
  › React
    Next.js
    Vue
    Vanilla JS

? Your project slug: abc123xyz

→ installs @formsy/react (or relevant package)
→ creates FormsyContactForm.tsx in current directory
→ prints: "Edit the component, then read docs at formsy.dev/docs"
```

### Implementation
- Use `@clack/prompts` for interactive CLI
- Templates stored as strings in `packages/cli/templates/`
- One template per framework
- Publish as `@formsy/init` to npm with `bin` entry

---

## Security Checklist

Run through this before any deployment.

- [ ] All authed routes have `authMiddleware`
- [ ] `/submit/:slug` enforces CORS `allowed_origins`
- [ ] Payload size capped at 50KB in Hono middleware
- [ ] IP stored as SHA-256 hash only
- [ ] Honeypot silently discards, returns 200
- [ ] Rate limiter on `/submit` per IP + per project quota
- [ ] LemonSqueezy webhook verifies HMAC signature before processing
- [ ] JWT secret is min 64 chars, from `openssl rand -hex 32`
- [ ] Refresh tokens are hashed in DB, never stored raw
- [ ] All DB queries scoped with `WHERE user_id = ?`
- [ ] No raw error messages returned to client in production
- [ ] `NODE_ENV=production` disables stack traces in responses
- [ ] HTTPS enforced (handled by deployment platform)
- [ ] Zod strips unknown keys on every inbound schema

---

## Deployment

| Service | What |
|---|---|
| Railway / Render | `apps/api` Node.js server |
| Vercel | `apps/web` React/Vite frontend |
| Neon | PostgreSQL |
| Upstash | Redis |
| Cloudflare R2 + Workers | CDN for SDK (`packages/sdk`) |

### ENV per environment
- Copy `.env.example` → `.env.production`
- Set all vars in deployment platform dashboard
- Never commit `.env`

---

## Build Order Summary

```
Phase 1  → Repo bootstrap + DB schema + migrations
Phase 2  → GitHub OAuth + JWT auth
Phase 3  → Projects CRUD + plan limits
Phase 4  → Public submit endpoint + validation + rate limiting
Phase 5  → Email notifications (pg-boss + Resend/Brevo)
Phase 6  → React dashboard UI
Phase 7  → LemonSqueezy billing + webhooks
Phase 8  → Plan enforcement (projects + quota)
Phase 9  → Vanilla JS CDN SDK
Phase 10 → npx CLI
```

Each phase is independently deployable and testable. Do not start the next phase until the current one works end-to-end.

---

## Definition of Done (per phase)

- **Phase 1**: `GET /health` returns 200. All tables exist in DB. No TS errors.
- **Phase 2**: Can log in with GitHub. JWT issued. Refresh works. Logout clears cookie.
- **Phase 3**: Can create (up to plan limit), list, update, delete projects via API.
- **Phase 4**: Posting valid JSON to `/submit/:slug` stores submission. Invalid data returns 422. Over-quota returns 429.
- **Phase 5**: Submitting triggers email to project owner within 10 seconds.
- **Phase 6**: All dashboard pages render. Can create project, view endpoint, see submissions, mark as read, export CSV.
- **Phase 7**: Clicking upgrade → LemonSqueezy checkout → webhook → plan updated in DB.
- **Phase 8**: Creating project beyond limit returns 403. Submitting beyond monthly quota returns 429.
- **Phase 9**: HTML file with CDN script can submit to real endpoint. Bundle < 5KB gzipped.
- **Phase 10**: `npx @formsy/init` generates a working component for each framework.
