import React, { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '../lib/api'
import {
  Copy,
  Trash2,
  Inbox,
  Check,
  ArrowLeft,
  Code,
  Pencil,
  X,
  Plus,
} from 'lucide-react'
import { toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'

interface Field {
  name: string
  label: string
  type: 'text' | 'email' | 'number' | 'boolean' | 'textarea'
  required: boolean
}

const FIELD_TYPES = ['text', 'email', 'number', 'boolean', 'textarea'] as const

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editFields, setEditFields] = useState<Field[]>([])

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  })

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast('Form deleted')
      navigate('/dashboard')
    },
    onError: () => toast('Failed to delete form', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; schema: Field[] }) =>
      projectsApi.update(id!, {
        name: data.name,
        schema: data.schema,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsEditing(false)
      toast('Form updated!')
    },
    onError: () => toast('Failed to update form', 'error'),
  })

  function openEdit() {
    if (!project) return
    setEditName(project.name)
    setEditFields((project.schema as Field[]).map((f) => ({ ...f })))
    setIsEditing(true)
  }

  function addField() {
    setEditFields((prev) => [
      ...prev,
      { name: '', label: '', type: 'text', required: false },
    ])
  }

  function removeField(i: number) {
    setEditFields((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateField(i: number, patch: Partial<Field>) {
    setEditFields((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f))
    )
  }

  function saveEdit() {
    if (!editName.trim()) return toast('Form name is required', 'error')
    if (editFields.length === 0) return toast('At least one field is required', 'error')
    for (const f of editFields) {
      if (!f.name.trim() || !f.label.trim()) return toast('All fields need a name and label', 'error')
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name))
        return toast(`Field key "${f.name}" must be alphanumeric (letters, numbers, _)`, 'error')
    }
    updateMutation.mutate({ name: editName, schema: editFields })
  }

  function copyEndpoint() {
    if (!project?.endpoint_url) return
    navigator.clipboard.writeText(project.endpoint_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (isLoading) {
    return (
      <div style={{ flex: 1, padding: 'var(--space-xxl)' }}>
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-lg)', marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (!project) return null

  const schema = project.schema as Field[]

  const exampleSnippet = `// Vanilla JS
fetch('${project.endpoint_url}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
${schema.map((f) => `    ${f.name}: '...'`).join(',\n')},
  }),
})
.then(r => r.json())
.then(console.log)

// CDN snippet
Formsy.submit('${project.slug}', {
${schema.map((f) => `  ${f.name}: '...'`).join(',\n')},
})`

  return (
    <div style={{ flex: 1, padding: 'var(--space-xxl)', maxWidth: 760 }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xxl)' }}>
        <Link
          to="/dashboard"
          className="btn-ghost btn-sm flex items-center gap-xs"
          style={{ marginBottom: 16, color: 'var(--steel)', fontSize: 14, display: 'inline-flex' }}
        >
          <ArrowLeft size={14} /> All forms
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading-3" style={{ color: 'var(--ink)' }}>{project.name}</h1>
            <p className="text-caption" style={{ color: 'var(--steel)', marginTop: 4 }}>
              {schema.length} fields · {project.submission_count} submissions
            </p>
          </div>
          <div className="flex items-center gap-sm">
            <button
              onClick={openEdit}
              className="btn btn-secondary btn-sm"
            >
              <Pencil size={14} /> Edit
            </button>
            <Link
              to={`/dashboard/projects/${id}/submissions`}
              className="btn btn-secondary btn-sm"
            >
              <Inbox size={14} /> Submissions
            </Link>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn btn-danger btn-sm"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Endpoint URL */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="flex items-center gap-xs" style={{ marginBottom: 'var(--space-sm)' }}>
          <Code size={16} color="var(--brand-green)" />
          <h2 className="text-body-sm-med" style={{ color: 'var(--ink)' }}>Endpoint URL</h2>
        </div>
        <p className="text-caption" style={{ color: 'var(--steel)', marginBottom: 12 }}>
          POST JSON to this URL from any site or script.
        </p>
        <div
          className="flex items-center gap-sm"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-sm) var(--space-md)',
          }}
        >
          <code
            className="flex-1"
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 13,
              color: 'var(--charcoal)',
              wordBreak: 'break-all',
            }}
          >
            {project.endpoint_url}
          </code>
          <button
            onClick={copyEndpoint}
            className="btn btn-primary btn-sm"
            style={{ flexShrink: 0 }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Code example */}
      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="code-block">
          <div className="code-block-header">
            <span className="code-block-header-label">Integration example</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigator.clipboard.writeText(exampleSnippet).then(() => toast('Copied!'))}
              style={{ color: 'var(--on-dark-muted)', fontSize: 12, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--hairline-dark)' }}
            >
              Copy
            </button>
          </div>
          <div className="code-block-body">
            <pre>{exampleSnippet}</pre>
          </div>
        </div>
      </div>

      {/* Schema */}
      <div className="card">
        <h2 className="text-body-sm-med" style={{ color: 'var(--ink)', marginBottom: 16 }}>
          Form schema
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Field key</th>
                <th>Label</th>
                <th>Type</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {schema.map((f) => (
                <tr key={f.name}>
                  <td><code className="code-inline" style={{ fontSize: 12 }}>{f.name}</code></td>
                  <td style={{ color: 'var(--slate)' }}>{f.label}</td>
                  <td>
                    <span className="badge badge-surface">{f.type}</span>
                  </td>
                  <td>
                    {f.required ? (
                      <span className="badge badge-error">Required</span>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 13 }}>Optional</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Delete Modal ───────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={showDeleteModal}
        danger
        title={`Delete "${project.name}"?`}
        message="All submissions will be permanently removed. This cannot be undone. Your monthly submission quota will still reflect these submissions for the rest of the month."
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete form'}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDeleteModal(false)}
      />

      {/* ─── Edit Modal ────────────────────────────────────────────────── */}
      {isEditing && (
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
          onClick={() => setIsEditing(false)}
        >
          {/* Backdrop — solid dark, no blur */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
          }} />

          {/* Panel */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              background: '#ffffff',
              border: '1px solid #e5e5e5',
              borderRadius: 'var(--radius-xl)',
              padding: 32,
              width: '100%',
              maxWidth: 560,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              animation: 'modal-in 180ms cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
              <h2 className="text-heading-5" style={{ color: 'var(--ink)' }}>Edit form</h2>
              <button className="btn-ghost" style={{ padding: 6, borderRadius: 6, color: 'var(--steel)' }} onClick={() => setIsEditing(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 24 }}>
              <label className="text-caption" style={{ display: 'block', color: 'var(--steel)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Form name
              </label>
              <input
                className="input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="My contact form"
                style={{ width: '100%' }}
              />
            </div>

            {/* Fields */}
            <div style={{ marginBottom: 20 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <label className="text-caption" style={{ color: 'var(--steel)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Fields ({editFields.length})
                </label>
                <button className="btn btn-secondary btn-sm" onClick={addField}>
                  <Plus size={13} /> Add field
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {editFields.map((field, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'var(--radius-md)',
                      padding: 14,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label className="text-caption" style={{ display: 'block', color: 'var(--steel)', marginBottom: 4, fontSize: 11 }}>Key</label>
                        <input
                          className="input"
                          value={field.name}
                          onChange={(e) => updateField(i, { name: e.target.value })}
                          placeholder="field_name"
                          style={{ width: '100%', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label className="text-caption" style={{ display: 'block', color: 'var(--steel)', marginBottom: 4, fontSize: 11 }}>Label</label>
                        <input
                          className="input"
                          value={field.label}
                          onChange={(e) => updateField(i, { label: e.target.value })}
                          placeholder="Display label"
                          style={{ width: '100%', fontSize: 13 }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
                      <select
                        className="input"
                        value={field.type}
                        onChange={(e) => updateField(i, { type: e.target.value as Field['type'] })}
                        style={{ fontSize: 13 }}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-xs" style={{ fontSize: 13, color: 'var(--slate)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(i, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <button
                        className="btn-ghost"
                        onClick={() => removeField(i)}
                        style={{ color: 'var(--brand-error)', padding: 4, borderRadius: 4 }}
                        title="Remove field"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-sm" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveEdit}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
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
      )}
    </div>
  )
}
