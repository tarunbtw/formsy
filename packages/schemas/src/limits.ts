// ─── Plan Limits ─────────────────────────────────────────────────────────────
// Single source of truth for plan enforcement across the entire stack.
// Referenced by: POST /projects (count check) and POST /submit/:slug (quota check).

export const PLAN_LIMITS = {
  free: {
    projects: 2,
    submissions_per_month: 100,
  },
  starter: {
    projects: 5,
    submissions_per_month: 10_000,
  },
  pro: {
    projects: 15,
    submissions_per_month: 35_000,
  },
  max: {
    projects: Infinity,
    submissions_per_month: 100_000,
  },
} as const

export type Plan = keyof typeof PLAN_LIMITS

export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free
}

export const PLAN_NAMES: Record<Plan, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  max: 'Max',
}

export const PLAN_PRICES: Record<Exclude<Plan, 'free'>, number> = {
  starter: 7,
  pro: 10,
  max: 30,
}
