import React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderPlus,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export function TopNav() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isLandingPage = location.pathname === '/'

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <nav className="top-nav">
      {/* Logo always goes to landing page */}
      <Link to="/" className="nav-logo">
        <span className="nav-logo-dot" />
        Formsy
      </Link>

      <div className="flex-1" />

      {isAuthenticated ? (
        isLandingPage ? (
          // On landing page: just show Dashboard button
          <Link to="/dashboard" className="btn btn-primary btn-sm">
            Dashboard
          </Link>
        ) : (
          // In dashboard: show full nav actions
          <div className="flex items-center gap-md">
            <Link to="/dashboard/projects/new" className="btn btn-secondary btn-sm">
              <FolderPlus size={14} />
              New form
            </Link>
            <Link to="/dashboard/settings">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? 'Avatar'}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '2px solid var(--hairline)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--brand-green)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--primary)',
                  }}
                >
                  {(user?.name ?? user?.email ?? 'U')[0].toUpperCase()}
                </div>
              )}
            </Link>
            <button onClick={handleLogout} className="btn-ghost" style={{ padding: '6px', borderRadius: '6px', color: 'var(--steel)' }}>
              <LogOut size={16} />
            </button>
          </div>
        )
      ) : (
        <a
          href={`${API_BASE}/auth/github`}
          className="btn btn-primary btn-sm"
        >
          Sign in with GitHub
        </a>
      )}
    </nav>
  )
}

export function DashboardSidebar() {
  const location = useLocation()

  const isActive = (path: string) => location.pathname.startsWith(path)

  return (
    <aside className="sidebar">
      <div className="sidebar-section-header">Navigation</div>
      <nav>
        <Link
          to="/dashboard"
          className={`sidebar-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
        >
          <LayoutDashboard size={16} />
          All Forms
        </Link>
        <Link
          to="/dashboard/projects/new"
          className={`sidebar-item ${isActive('/dashboard/projects/new') ? 'active' : ''}`}
        >
          <FolderPlus size={16} />
          New Form
        </Link>
      </nav>

      <div className="sidebar-section-header" style={{ marginTop: 24 }}>Account</div>
      <nav>
        <Link
          to="/dashboard/settings"
          className={`sidebar-item ${isActive('/dashboard/settings') ? 'active' : ''}`}
        >
          <Settings size={16} />
          Settings & Billing
        </Link>
      </nav>
    </aside>
  )
}
