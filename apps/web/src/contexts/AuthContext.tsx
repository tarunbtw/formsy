import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { authApi, setAccessToken, clearAccessToken, getAccessToken } from '../lib/api'

interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  plan: string
  createdAt: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const userData = await authApi.me()
      setUser(userData)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    async function init() {
      setIsLoading(true)
      try {
        // Check URL for token from OAuth callback
        const urlParams = new URLSearchParams(window.location.search)
        const token = urlParams.get('token')

        if (token) {
          setAccessToken(token)
          // Clean URL
          const url = new URL(window.location.href)
          url.searchParams.delete('token')
          window.history.replaceState({}, '', url.toString())
        } else if (!getAccessToken()) {
          // Try to refresh from httpOnly cookie
          try {
            const res = await authApi.refresh()
            setAccessToken(res.accessToken)
          } catch {
            // Not logged in — that's fine
            setIsLoading(false)
            return
          }
        }

        await fetchUser()
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [fetchUser])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      clearAccessToken()
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
