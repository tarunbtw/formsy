import React from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/Toast'
import { TopNav, DashboardSidebar } from './components/Layout'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import NewProjectPage from './pages/NewProjectPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SubmissionsPage from './pages/SubmissionsPage'
import SettingsPage from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
})

// Protected route wrapper
function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border: '2px solid var(--hairline)',
            borderTop: '2px solid var(--brand-green)',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
        <span className="text-body-sm" style={{ color: 'var(--steel)' }}>Loading…</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

// Dashboard layout with sidebar
function DashboardLayout() {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      <DashboardSidebar />
      <Outlet />
    </div>
  )
}

function AppRoutes() {

  return (
    <>
      <TopNav />
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* Protected dashboard routes */}
        <Route element={<RequireAuth />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/projects/new" element={<NewProjectPage />} />
            <Route path="/dashboard/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/dashboard/projects/:id/submissions" element={<SubmissionsPage />} />
            <Route path="/dashboard/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
