import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { authApi, billingApi, projectsApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  User,
  CreditCard,
  ExternalLink,
  Zap,
  Check,
  AlertCircle,
} from 'lucide-react'
import { toast } from '../components/Toast'

const PLAN_LIMITS: Record<string, { projects: number; submissions: number }> = {
  free: { projects: 2, submissions: 100 },
  starter: { projects: 5, submissions: 10000 },
  pro: { projects: 15, submissions: 35000 },
  max: { projects: Infinity, submissions: 100000 },
}

const PLAN_PRICES: Record<string, number> = {
  free: 0, starter: 7, pro: 10, max: 30,
}

const UPGRADE_PLANS = ['starter', 'pro', 'max'] as const

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  const { data: userFull } = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
  })

  const plan = userFull?.plan ?? user?.plan ?? 'free'
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free

  const { data: usage } = useQuery<{
    forms: { used: number; limit: number }
    submissions: { used: number; limit: number }
  }>({
    queryKey: ['usage'],
    queryFn: projectsApi.usage,
    refetchInterval: 30_000, // refresh every 30s
  })

  async function handleUpgrade(targetPlan: string) {
    setCheckoutLoading(targetPlan)
    try {
      const { checkoutUrl } = await billingApi.checkout(targetPlan)
      window.location.href = checkoutUrl
    } catch {
      toast('Failed to create checkout session', 'error')
      setCheckoutLoading(null)
    }
  }

  async function handlePortal() {
    try {
      const { portalUrl } = await billingApi.portal()
      window.open(portalUrl, '_blank')
    } catch {
      toast('Could not open billing portal', 'error')
    }
  }

  return (
    <div style={{ flex: 1, padding: 'var(--space-xxl)', maxWidth: 640 }}>
      <div style={{ marginBottom: 'var(--space-xxl)' }}>
        <h1 className="text-heading-3" style={{ color: 'var(--ink)' }}>Settings</h1>
        <p className="text-body-sm" style={{ color: 'var(--steel)', marginTop: 4 }}>
          Manage your account and subscription.
        </p>
      </div>

      {/* ─── Profile ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 'var(--space-xxl)' }}>
        <h2 className="text-body-sm-med" style={{ color: 'var(--steel)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
          Profile
        </h2>
        <div className="card flex items-center gap-lg">
          {userFull?.avatarUrl ? (
            <img
              src={userFull.avatarUrl}
              alt="Avatar"
              style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--hairline)' }}
            />
          ) : (
            <div
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--brand-green)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 600, color: 'var(--primary)',
              }}
            >
              {(userFull?.name ?? userFull?.email ?? 'U')[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <p className="text-body-md-med" style={{ color: 'var(--ink)' }}>
              {userFull?.name ?? '—'}
            </p>
            <p className="text-body-sm" style={{ color: 'var(--steel)' }}>
              {userFull?.email}
            </p>
          </div>
          <span className="badge badge-green" style={{ textTransform: 'capitalize' }}>
            {plan}
          </span>
        </div>
      </section>

      {/* ─── Current plan ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 'var(--space-xxl)' }}>
        <h2 className="text-body-sm-med" style={{ color: 'var(--steel)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
          Subscription
        </h2>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div>
              <p className="text-heading-5" style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>
                {plan} plan
              </p>
              <p className="text-caption" style={{ color: 'var(--steel)', marginTop: 2 }}>
                ${PLAN_PRICES[plan] ?? 0}/month
              </p>
            </div>
            {plan !== 'free' && (
              <button
                onClick={handlePortal}
                className="btn btn-secondary btn-sm"
              >
                <ExternalLink size={13} />
                Manage billing
              </button>
            )}
          </div>

          {/* Usage bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <UsageBar
              label="Forms"
              used={usage?.forms.used ?? 0}
              limit={usage?.forms.limit ?? limits.projects}
            />
            <UsageBar
              label="Submissions this month"
              used={usage?.submissions.used ?? 0}
              limit={usage?.submissions.limit ?? limits.submissions}
            />
          </div>
        </div>

        {/* Upgrade plans */}
        {plan !== 'max' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-md)' }}>
            {UPGRADE_PLANS.filter((p) => {
              const order: Record<string, number> = { free: 0, starter: 1, pro: 2, max: 3 }
              return order[p] > (order[plan] ?? 0)
            }).map((targetPlan) => (
              <div
                key={targetPlan}
                className="card"
                style={{ padding: 'var(--space-lg)', textAlign: 'center' }}
              >
                <p className="text-body-sm-med" style={{ color: 'var(--ink)', textTransform: 'capitalize', marginBottom: 4 }}>
                  {targetPlan}
                </p>
                <p className="text-heading-4" style={{ marginBottom: 12, color: 'var(--ink)' }}>
                  ${PLAN_PRICES[targetPlan]}<span className="text-caption" style={{ color: 'var(--steel)' }}>/mo</span>
                </p>
                <button
                  onClick={() => handleUpgrade(targetPlan)}
                  className="btn btn-primary btn-sm w-full"
                  disabled={checkoutLoading === targetPlan}
                >
                  {checkoutLoading === targetPlan ? (
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                  ) : (
                    <><Zap size={13} /> Upgrade</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Danger zone ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-body-sm-med" style={{ color: 'var(--steel)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 11 }}>
          Danger zone
        </h2>
        <div className="card flex items-center justify-between">
          <div>
            <p className="text-body-sm-med" style={{ color: 'var(--ink)' }}>Sign out</p>
            <p className="text-caption" style={{ color: 'var(--steel)' }}>Sign out of your account on this device.</p>
          </div>
          <button onClick={() => logout()} className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </div>
      </section>
    </div>
  )
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isInfinite = limit === Infinity
  const pct = isInfinite ? 0 : Math.min((used / limit) * 100, 100)
  const isWarning = pct > 80

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span className="text-caption" style={{ color: 'var(--slate)' }}>{label}</span>
        <span className="text-caption" style={{ color: isWarning ? 'var(--brand-error)' : 'var(--steel)' }}>
          {used.toLocaleString()} / {isInfinite ? '∞' : limit.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 4, background: 'var(--hairline)', borderRadius: 2, overflow: 'hidden' }}>
        {!isInfinite && (
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: isWarning ? 'var(--brand-error)' : 'var(--brand-green)',
              borderRadius: 2,
              transition: 'width 400ms ease',
            }}
          />
        )}
      </div>
    </div>
  )
}
