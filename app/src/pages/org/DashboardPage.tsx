import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { DashboardData } from '../../types'
import { fmtDate, isOverdue } from '../../lib'
import { Avatar, Badge, Card, EmptyState, Spinner } from '../../components/ui'

export function DashboardPage() {
  const { event } = useOrg()
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => { api.dashboard(event.id).then(setData) }, [event.id])

  if (!data) return <Spinner label="Loading dashboard…" />
  const { counts, task_defs, matrix } = data

  const stats = [
    { lbl: 'Confirmed speakers', num: counts.speakers, to: '/org/submissions?status=accepted' },
    { lbl: 'Submissions', num: counts.submissions, to: '/org/submissions' },
    { lbl: 'Accepted', num: counts.accepted, to: '/org/submissions' },
    { lbl: 'Scheduled talks', num: counts.scheduled, to: '/org/schedule' },
    { lbl: 'Onboarding done', num: counts.tasks_total ? `${Math.round((counts.tasks_done / counts.tasks_total) * 100)}%` : '—' },
    { lbl: 'Overdue items', num: counts.overdue, danger: counts.overdue > 0 },
  ]

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{event.name}</h1>
          <p className="muted small">{fmtDate(event.starts_on, { month: 'long', day: 'numeric' })} – {fmtDate(event.ends_on, { month: 'long', day: 'numeric', year: 'numeric' })} · {event.timezone}</p>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.lbl} className="card stat">
            <div className="num" style={s.danger ? { color: 'var(--danger)' } : undefined}>{s.num}</div>
            <div className="lbl">{s.to ? <Link to={s.to} style={{ color: 'inherit' }}>{s.lbl}</Link> : s.lbl}</div>
          </div>
        ))}
      </div>

      <Card title="Speaker onboarding" pad={false}
        actions={<span className="muted small">{counts.tasks_done}/{counts.tasks_total} tasks complete</span>}>
        {matrix.length === 0 ? (
          <EmptyState glyph="🪑" title="No confirmed speakers yet">Accept submissions to start onboarding.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="gr">
              <thead>
                <tr>
                  <th>Speaker</th>
                  {task_defs.map((t) => (
                    <th key={t.key} title={t.due_at ? `Due ${fmtDate(t.due_at)}` : undefined}>
                      {t.label}
                      {t.due_at && (
                        <div className="small" style={{
                          textTransform: 'none', letterSpacing: 0, fontWeight: 500,
                          color: isOverdue(t.due_at) ? 'var(--danger)' : 'var(--faint)',
                        }}>
                          due {fmtDate(t.due_at)}
                        </div>
                      )}
                    </th>
                  ))}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => {
                  const doneCount = task_defs.filter((t) => row.tasks[t.key]?.done).length
                  return (
                    <tr key={row.speaker.id}>
                      <td>
                        <span className="row" style={{ gap: 9 }}>
                          <Avatar name={row.speaker.name} size={28} />
                          <span>
                            {row.speaker.name}
                            <div className="faint small">{row.speaker.email}</div>
                          </span>
                        </span>
                      </td>
                      {task_defs.map((t) => {
                        const cell = row.tasks[t.key]
                        const overdue = row.overdue.includes(t.key)
                        return (
                          <td key={t.key} style={{ textAlign: 'center' }}
                            title={cell?.done ? `Done ${fmtDate(cell.done_at)}` : overdue ? 'Overdue' : 'Pending'}>
                            <span aria-label={cell?.done ? 'done' : overdue ? 'overdue' : 'pending'} style={{
                              display: 'inline-flex', width: 22, height: 22, borderRadius: '50%',
                              alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                              background: cell?.done ? 'var(--ok-soft)' : overdue ? 'var(--danger-soft)' : 'var(--surface-3)',
                              color: cell?.done ? 'var(--ok)' : overdue ? 'var(--danger)' : 'var(--faint)',
                            }}>
                              {cell?.done ? '✓' : overdue ? '!' : '·'}
                            </span>
                          </td>
                        )
                      })}
                      <td>
                        {row.overdue.length > 0
                          ? <Badge tone="badge-danger">{row.overdue.length} overdue</Badge>
                          : doneCount === task_defs.length
                            ? <Badge tone="badge-ok">ready</Badge>
                            : <Badge>{doneCount}/{task_defs.length}</Badge>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
