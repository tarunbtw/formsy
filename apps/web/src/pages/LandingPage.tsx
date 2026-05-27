import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Zap, Shield, Mail, Code2, Check, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const FEATURES = [
  {
    icon: Zap,
    title: 'Instant endpoint',
    desc: 'Define your schema and get a POST endpoint in seconds. No backend required.',
  },
  {
    icon: Shield,
    title: 'Spam protection',
    desc: 'Built-in rate limiting, CORS allowlist, and honeypot field filtering.',
  },
  {
    icon: Mail,
    title: 'Email alerts',
    desc: 'Get notified instantly on every new submission via Resend or Brevo.',
  },
  {
    icon: Code2,
    title: 'CDN snippet',
    desc: 'Drop in a 5KB script tag. Works with any site — no framework needed.',
  },
]

const PLANS = [
  {
    name: 'Free',
    price: 0,
    features: ['2 forms', '100 submissions/mo', 'Email notifications', 'CDN snippet'],
    cta: 'Get started free',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: 7,
    features: ['5 forms', '10,000 submissions/mo', 'Email notifications', 'CDN snippet', 'Priority support'],
    cta: 'Start for $7/mo',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: 10,
    features: ['15 forms', '35,000 submissions/mo', 'Email notifications', 'CDN snippet', 'Priority support'],
    cta: 'Start for $10/mo',
    highlighted: false,
  },
  {
    name: 'Max',
    price: 30,
    features: ['Unlimited forms', '100,000 submissions/mo', 'Email notifications', 'CDN snippet', 'Dedicated support'],
    cta: 'Start for $30/mo',
    highlighted: false,
  },
]

export default function LandingPage() {
  const [searchParams] = useSearchParams()
  const authError = searchParams.get('auth_error')
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <div style={{ background: 'var(--canvas)' }}>
      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(180deg, var(--hero-sky-from) 0%, var(--canvas) 100%)',
          padding: '120px var(--space-xxl) 96px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative blobs */}
        <div style={{
          position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 400,
          background: 'radial-gradient(ellipse, rgba(0,212,164,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div className="badge badge-green" style={{ marginBottom: 24, fontSize: 12 }}>
            Form Backend SaaS
          </div>

          {authError && (
            <div style={{
              background: 'rgba(229,62,62,0.08)',
              border: '1px solid rgba(229,62,62,0.2)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 20px',
              color: 'var(--brand-error)',
              fontSize: 14,
              marginBottom: 24,
            }}>
              {authError === 'access_denied' && 'GitHub authorization was denied.'}
              {authError === 'no_email' && 'Your GitHub account has no public email.'}
              {authError === 'server_error' && 'Authentication failed. Please try again.'}
              {authError === 'session_expired' && 'Your session expired. Please sign in again.'}
            </div>
          )}

          <h1
            className="text-hero-display"
            style={{ color: 'var(--ink)', marginBottom: 24 }}
          >
            Your form backend,{' '}
            <span style={{ color: 'var(--brand-green)' }}>instant.</span>
          </h1>

          <p
            className="text-subtitle"
            style={{ color: 'var(--slate)', marginBottom: 40, maxWidth: 540, margin: '0 auto 40px' }}
          >
            Define a schema, get a POST endpoint, embed it anywhere. Submissions
            land in your dashboard and your inbox.
          </p>

          <div className="flex items-center justify-end gap-md" style={{ justifyContent: 'center' }}>
            {!isLoading && isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">
                <LayoutDashboard size={16} />
                Go to Dashboard
              </Link>
            ) : (
              <a href={`${API_BASE}/auth/github`} className="btn btn-primary btn-lg">
                Start with GitHub
                <ArrowRight size={16} />
              </a>
            )}
            <a href="#pricing" className="btn btn-secondary btn-lg">
              See pricing
            </a>
          </div>
        </div>

        {/* ─── Code preview ──────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 64,
            maxWidth: 680,
            margin: '64px auto 0',
            textAlign: 'left',
            boxShadow: 'var(--shadow-3)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--hairline-soft)',
          }}
        >
          <div className="code-block-header" style={{ background: '#1e1e1e', borderColor: 'rgba(255,255,255,0.06)' }}>
            <span className="code-block-header-label">Example integration</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F56' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27C93F' }} />
            </div>
          </div>
          <div className="code-block-body" style={{ background: '#1e1e1e' }}>
            <pre style={{ fontSize: 13 }}>{`<script src="https://cdn.formsy.dev/v1/formsy.min.js"></script>

<script>
  Formsy.submit('your-slug', {
    name:    form.name.value,
    email:   form.email.value,
    message: form.message.value,
  })
  .then(() => alert('Sent!'))
  .catch(console.error)
</script>`}</pre>
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────────── */}
      <section style={{ padding: 'var(--space-section-lg) var(--space-xxl)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 className="text-heading-2" style={{ color: 'var(--ink)', marginBottom: 16 }}>
              Everything you need
            </h2>
            <p className="text-body-md" style={{ color: 'var(--slate)', maxWidth: 480, margin: '0 auto' }}>
              A backend for your forms, without the backend.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'var(--space-xl)',
            }}
          >
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    background: 'var(--brand-green-soft)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 'var(--space-md)',
                    color: 'var(--brand-green-deep)',
                  }}
                >
                  <f.icon size={20} />
                </div>
                <h3 className="text-heading-5" style={{ marginBottom: 8, color: 'var(--ink)' }}>
                  {f.title}
                </h3>
                <p className="text-body-sm" style={{ color: 'var(--steel)' }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─────────────────────────────────────────────────────── */}
      <section
        id="pricing"
        style={{
          padding: 'var(--space-section-lg) var(--space-xxl)',
          background: 'var(--surface)',
        }}
      >
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 className="text-heading-2" style={{ color: 'var(--ink)', marginBottom: 16 }}>
              Pricing on your terms
            </h2>
            <p className="text-body-md" style={{ color: 'var(--slate)' }}>
              Start free, upgrade when you need more.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-xl)',
              alignItems: 'start',
            }}
          >
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={plan.highlighted ? 'card-featured' : 'card'}
                style={{ padding: 'var(--space-xxl)', position: 'relative' }}
              >
                {plan.highlighted && (
                  <div
                    className="badge badge-green"
                    style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 11 }}
                  >
                    Popular
                  </div>
                )}
                <h3 className="text-heading-4" style={{ color: 'var(--ink)', marginBottom: 8 }}>
                  {plan.name}
                </h3>
                <div style={{ marginBottom: 24 }}>
                  <span className="text-display-lg" style={{ fontSize: 40, letterSpacing: -1, color: 'var(--ink)' }}>
                    ${plan.price}
                  </span>
                  <span className="text-body-sm" style={{ color: 'var(--steel)' }}>/mo</span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: 32 }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-xs"
                      style={{ padding: '6px 0', fontSize: 14, color: 'var(--charcoal)' }}
                    >
                      <Check size={14} color="var(--brand-green)" style={{ flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={isAuthenticated ? '/dashboard' : `${API_BASE}/auth/github`}
                  className={`btn w-full ${plan.highlighted ? 'btn-accent' : 'btn-secondary'}`}
                >
                  {isAuthenticated ? 'Go to Dashboard' : plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid var(--hairline)',
          padding: 'var(--space-xxl)',
          textAlign: 'center',
        }}
      >
        <p className="text-body-sm" style={{ color: 'var(--steel)' }}>
          © 2024 Formsy · Built with ♥ ·{' '}
          {isAuthenticated ? (
            <Link to="/dashboard" style={{ color: 'var(--brand-green)' }}>Dashboard</Link>
          ) : (
            <a href={`${API_BASE}/auth/github`} style={{ color: 'var(--brand-green)' }}>Sign in with GitHub</a>
          )}
        </p>
      </footer>
    </div>
  )
}
