import React, { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  loading?: boolean
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger = false,
  loading = false,
}: ConfirmModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={onCancel}
    >
      {/* Backdrop — solid dark, no blur */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          animation: 'modal-in 180ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Icon */}
        {danger && (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(229,62,62,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <AlertTriangle size={22} color="var(--brand-error)" />
          </div>
        )}

        <h2
          id="modal-title"
          className="text-heading-5"
          style={{ color: 'var(--ink)', marginBottom: 8 }}
        >
          {title}
        </h2>
        <p className="text-body-sm" style={{ color: 'var(--steel)', marginBottom: 28, lineHeight: 1.6 }}>
          {message}
        </p>

        <div className="flex items-center gap-sm" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
            style={{ minWidth: 90 }}
          >
            {loading ? (
              <span style={{
                display: 'inline-block',
                width: 14,
                height: 14,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }} />
            ) : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  )
}
