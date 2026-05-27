import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  ArrowLeft,
  Circle,
  CheckCircle2,
  Download,
  ChevronDown,
  ChevronUp,
  Inbox,
} from 'lucide-react'

interface Submission {
  id: string
  data: Record<string, unknown>
  ipHash: string
  isRead: boolean
  createdAt: string
}

interface SubmissionsResponse {
  submissions: Submission[]
  total: number
  page: number
  totalPages: number
}

function exportCsv(submissions: Submission[], projectName: string) {
  if (!submissions.length) return

  const allKeys = Array.from(
    new Set(submissions.flatMap((s) => Object.keys(s.data)))
  )

  const header = ['date', 'read', ...allKeys]
  const rows = submissions.map((s) => [
    new Date(s.createdAt).toISOString(),
    s.isRead ? 'true' : 'false',
    ...allKeys.map((k) => {
      const val = s.data[k]
      const str = val == null ? '' : String(val)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }),
  ])

  const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName}-submissions-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function SubmissionsPage() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<SubmissionsResponse>({
    queryKey: ['submissions', id, page],
    queryFn: () =>
      api.get(`/api/projects/${id}/submissions`, { params: { page, limit: 20 } }).then((r) => r.data),
    enabled: !!id,
  })

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/api/projects/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const markReadMutation = useMutation({
    mutationFn: (submissionId: string) =>
      api.patch(`/api/projects/${id}/submissions/${submissionId}/read`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', id] })
    },
  })

  const submissions = data?.submissions ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div style={{ flex: 1, padding: 'var(--space-xxl)' }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-xxl)' }}>
        <Link
          to={`/dashboard/projects/${id}`}
          className="btn-ghost btn-sm flex items-center gap-xs"
          style={{ marginBottom: 16, color: 'var(--steel)', fontSize: 14, display: 'inline-flex' }}
        >
          <ArrowLeft size={14} /> {project?.name ?? 'Form'}
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-heading-3" style={{ color: 'var(--ink)' }}>Submissions</h1>
            <p className="text-caption" style={{ color: 'var(--steel)', marginTop: 4 }}>
              {total} total · {submissions.filter((s) => !s.isRead).length} unread
            </p>
          </div>
          <button
            onClick={() => exportCsv(submissions, project?.name ?? 'submissions')}
            className="btn btn-secondary btn-sm"
            disabled={submissions.length === 0}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8 }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && submissions.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Inbox size={24} /></div>
          <h3 className="text-heading-5" style={{ color: 'var(--ink)' }}>No submissions yet</h3>
          <p className="text-body-sm" style={{ color: 'var(--steel)', maxWidth: 360 }}>
            Once someone submits your form, it'll appear here.
          </p>
        </div>
      )}

      {/* Submissions table */}
      {!isLoading && submissions.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 12, paddingRight: 0 }} />
                <th>Date</th>
                <th>Preview</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <React.Fragment key={s.id}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setExpandedId(expandedId === s.id ? null : s.id)
                      if (!s.isRead) markReadMutation.mutate(s.id)
                    }}
                  >
                    {/* Read/unread dot */}
                    <td style={{ paddingRight: 0, width: 12 }}>
                      {s.isRead ? (
                        <Circle size={8} color="var(--hairline)" />
                      ) : (
                        <Circle size={8} color="var(--brand-green)" fill="var(--brand-green)" />
                      )}
                    </td>

                    {/* Date */}
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--slate)', fontSize: 13 }}>
                      {new Date(s.createdAt).toLocaleDateString()}{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    {/* Data preview */}
                    <td>
                      <span
                        style={{
                          fontSize: 13,
                          color: 'var(--charcoal)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                          maxWidth: 400,
                        }}
                      >
                        {Object.entries(s.data)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </span>
                    </td>

                    {/* Expand button */}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: 'var(--steel)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', fontSize: 12 }}>
                        {expandedId === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {expandedId === s.id ? 'Collapse' : 'Expand'}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded row */}
                  {expandedId === s.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: '0 var(--space-md) var(--space-md)', background: 'var(--surface)' }}>
                        <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', overflow: 'hidden' }}>
                          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <tbody>
                              {Object.entries(s.data).map(([k, v]) => (
                                <tr key={k}>
                                  <td
                                    style={{
                                      padding: '8px 12px',
                                      borderBottom: '1px solid var(--hairline-soft)',
                                      color: 'var(--steel)',
                                      fontWeight: 500,
                                      width: '35%',
                                      whiteSpace: 'nowrap',
                                      background: 'var(--surface-soft)',
                                    }}
                                  >
                                    {k}
                                  </td>
                                  <td
                                    style={{
                                      padding: '8px 12px',
                                      borderBottom: '1px solid var(--hairline-soft)',
                                      color: 'var(--charcoal)',
                                      wordBreak: 'break-word',
                                    }}
                                  >
                                    {String(v)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!s.isRead && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(s.id) }}
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 8, fontSize: 12, color: 'var(--brand-green)' }}
                          >
                            <CheckCircle2 size={13} /> Mark as read
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" style={{ marginTop: 'var(--space-xl)' }}>
          <span className="text-caption" style={{ color: 'var(--steel)' }}>
            Page {page} of {totalPages} · {total} submissions
          </span>
          <div className="flex items-center gap-sm">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
