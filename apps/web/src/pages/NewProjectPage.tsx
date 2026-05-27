import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '../lib/api'
import {
  Plus,
  Trash2,
  GripVertical,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react'
import { toast } from '../components/Toast'

type FieldType = 'text' | 'email' | 'number' | 'boolean' | 'textarea'

interface Field {
  id: string
  name: string
  type: FieldType
  required: boolean
  label: string
}

function newField(): Field {
  return { id: Math.random().toString(36).slice(2), name: '', type: 'text', required: false, label: '' }
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'textarea', label: 'Long text' },
]

export default function NewProjectPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [fields, setFields] = useState<Field[]>([newField()])
  const [allowedOrigins, setAllowedOrigins] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast('Form created!', 'success')
      navigate(`/dashboard/projects/${project.id}`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast(msg ?? 'Failed to create form', 'error')
    },
  })

  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Form name is required'
    fields.forEach((f, i) => {
      if (!f.name.trim()) errs[`field_name_${i}`] = 'Field key is required'
      if (!f.label.trim()) errs[`field_label_${i}`] = 'Label is required'
      if (f.name && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.name))
        errs[`field_name_${i}`] = 'Use only letters, numbers, underscores. Start with a letter.'
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const origins = allowedOrigins
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    createMutation.mutate({
      name: name.trim(),
      schema: fields.map(({ id: _id, ...f }) => f),
      allowed_origins: origins,
      email_notifications: emailNotifications,
    })
  }

  function updateField(id: string, patch: Partial<Field>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  function addField() {
    setFields((prev) => [...prev, newField()])
  }

  return (
    <div style={{ flex: 1, padding: 'var(--space-xxl)', maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xxl)' }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-ghost btn-sm flex items-center gap-xs"
          style={{ marginBottom: 16, color: 'var(--steel)', fontSize: 14 }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="text-heading-3" style={{ color: 'var(--ink)' }}>Create new form</h1>
        <p className="text-body-sm" style={{ color: 'var(--steel)', marginTop: 4 }}>
          Define your form schema to get a submission endpoint.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Form name */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <label className="label" htmlFor="form-name">Form name</label>
          <input
            id="form-name"
            className={`input ${errors.name ? 'input-error' : ''}`}
            placeholder="e.g. Contact form, Waitlist"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>

        {/* Schema builder */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-sm)' }}>
            <label className="label" style={{ margin: 0 }}>Form fields</label>
            <button type="button" onClick={addField} className="btn btn-ghost btn-sm">
              <Plus size={14} /> Add field
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {fields.map((field, i) => (
              <div
                key={field.id}
                className="card"
                style={{ padding: 'var(--space-md)', borderRadius: 'var(--radius-md)' }}
              >
                <div className="flex items-center gap-xs" style={{ marginBottom: 'var(--space-sm)' }}>
                  <GripVertical size={16} color="var(--steel)" style={{ cursor: 'grab', flexShrink: 0 }} />
                  <span className="badge badge-surface" style={{ fontSize: 11 }}>Field {i + 1}</span>
                  <div className="flex-1" />
                  <label className="flex items-center gap-xs" style={{ fontSize: 13, color: 'var(--slate)', cursor: 'pointer' }}>
                    <span>Required</span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      />
                      <span className="toggle-track" />
                    </label>
                  </label>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      className="btn-ghost"
                      style={{ padding: 4, borderRadius: 4, color: 'var(--brand-error)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                  <div>
                    <label className="label" style={{ fontSize: 12 }}>Field key</label>
                    <input
                      className={`input ${errors[`field_name_${i}`] ? 'input-error' : ''}`}
                      placeholder="e.g. email"
                      value={field.name}
                      onChange={(e) => updateField(field.id, { name: e.target.value })}
                    />
                    {errors[`field_name_${i}`] && (
                      <p className="field-error">{errors[`field_name_${i}`]}</p>
                    )}
                  </div>
                  <div>
                    <label className="label" style={{ fontSize: 12 }}>Display label</label>
                    <input
                      className={`input ${errors[`field_label_${i}`] ? 'input-error' : ''}`}
                      placeholder="e.g. Email address"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                    />
                    {errors[`field_label_${i}`] && (
                      <p className="field-error">{errors[`field_label_${i}`]}</p>
                    )}
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="label" style={{ fontSize: 12 }}>Type</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        className="input"
                        value={field.type}
                        onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Advanced settings */}
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <label className="label" htmlFor="origins">Allowed origins (optional)</label>
          <input
            id="origins"
            className="input"
            placeholder="https://yoursite.com, https://app.example.com"
            value={allowedOrigins}
            onChange={(e) => setAllowedOrigins(e.target.value)}
          />
          <p style={{ fontSize: 12, color: 'var(--steel)', marginTop: 4 }}>
            Comma-separated URLs. Leave empty to allow all origins (useful for development).
          </p>
        </div>

        <div
          className="flex items-center justify-between card"
          style={{ marginBottom: 'var(--space-xxl)', padding: 'var(--space-md) var(--space-lg)' }}
        >
          <div>
            <p className="text-body-sm-med" style={{ color: 'var(--ink)' }}>Email notifications</p>
            <p className="text-caption" style={{ color: 'var(--steel)' }}>Get an email for every new submission</p>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
            />
            <span className="toggle-track" />
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-md">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                Creating...
              </>
            ) : (
              'Create form'
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
