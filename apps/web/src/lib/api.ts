import axios from 'axios'

// Use relative URL so Vite proxy forwards to localhost:3001
// This makes cookies and auth same-origin in dev
const API_BASE = ''

// In-memory token store (never localStorage)
let accessToken: string | null = null

export function setAccessToken(token: string) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function clearAccessToken() {
  accessToken = null
}

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // needed for httpOnly refresh cookie
})

// ─── Request interceptor: attach Bearer token ─────────────────────────────────

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// ─── Response interceptor: 401 → refresh → retry once ────────────────────────

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        const newToken = res.data.accessToken
        setAccessToken(newToken)
        processQueue(null, newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        clearAccessToken()
        window.location.href = '/?auth_error=session_expired'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ─── API helpers ──────────────────────────────────────────────────────────────

export const authApi = {
  me: () => api.get('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  refresh: () => api.post('/auth/refresh').then((r) => r.data),
}

export const projectsApi = {
  list: () => api.get('/api/projects').then((r) => r.data),
  get: (id: string) => api.get(`/api/projects/${id}`).then((r) => r.data),
  create: (data: unknown) => api.post('/api/projects', data).then((r) => r.data),
  update: (id: string, data: unknown) =>
    api.patch(`/api/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/api/projects/${id}`).then((r) => r.data),
  usage: () => api.get('/api/projects/usage').then((r) => r.data),
}

export const submissionsApi = {
  list: (projectId: string, page = 1, limit = 20) =>
    api
      .get(`/api/projects/${projectId}/submissions`, { params: { page, limit } })
      .then((r) => r.data),
  markRead: (projectId: string, submissionId: string) =>
    api
      .patch(`/api/projects/${projectId}/submissions/${submissionId}/read`)
      .then((r) => r.data),
}

export const billingApi = {
  checkout: (plan: string) =>
    api.get(`/api/billing/checkout`, { params: { plan } }).then((r) => r.data),
  portal: () => api.get('/api/billing/portal').then((r) => r.data),
}
