import React, { useState, type ReactNode } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

// Simple module-level toast queue
let addToastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function toast(message: string, type: 'success' | 'error' = 'success') {
  addToastFn?.({ message, type })
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  addToastFn = (t) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 4000)
  }

  return (
    <>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'success' ? (
              <CheckCircle size={16} color="var(--brand-green)" />
            ) : (
              <XCircle size={16} color="var(--brand-error)" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ color: 'var(--on-dark-muted)', display: 'flex' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
