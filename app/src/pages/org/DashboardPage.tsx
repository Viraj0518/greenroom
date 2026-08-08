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
  const [err, setErr] = useState(false)

  useEffect(() => { api.dashboard(event.id).then(setData).catch(() => setErr(true)) }, [event.id])

  if (err) return <EmptyState glyph="⚠️" title="Could not load the dashboard">Try reloading.</EmptyState>
  if (!data) return <Spinner label="Loading dashboard…" />

  const tasks = data.tasks ?? []
  const rows = data.speakers ?? []
  const counts = data.counts
  const byStatus = counts.submissions_by_status ?? {}
  const submissionsTotal = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const tasksDone = rows.reduce((a, r) => a + r.done_count, 0)
  const tasksTotal = counts.speakers * counts.tasks

  const stats: Array<{ lbl: string; num: number | string; to?: string; danger?: boolean }> = [
    { lbl: 'Speakers', num: counts.speakers },
    { lbl: 'Submissions', num: submissionsTotal, to: '/org/submissions' },
    { lbl: 'Accepted', num: byStatus.accepted ?? 0, to: '/org/submissions' },
    { lbl: 'Onboarding done', num: tasksTotal ? `${Math.round((tasksDone / tasksTotal) * 100)}%` : '—' },
    { lbl: 'Speakers ready', num: `${counts.complete_speakers}/${counts.speakers}` },
    { lbl: 'Overdue items', num: counts.overdue, danger: counts.overdue > 0 },
  ]

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{event.name}</h1>
          <p className="muted small">
            {fmtDate(event.starts_on, { month: 'long', day: 'numeric' })} – {fmtDate(event.ends_on, { month: 'long', day: 'numeric', year: 'numeric' })} · {event.timezone}
          </p>
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
        actions={<span className="muted small">{tasksDone}/{tasksTotal} tasks complete</span>}>
        {rows.length === 0 ? (
          <EmptyState glyph="🪑" title="No speakers yet">Accept submissions to start onboarding.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="gr">
              <thead>
                <tr>
                  <th>Speaker</th>
                  {tasks.map((t) => (
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
                {rows.map((row) => (
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
                    {tasks.map((t) => {
                      const cell = row.tasks?.[t.key]
                      const done = !!cell?.done
                      const overdue = !!cell?.overdue
                      return (
                        <td key={t.key} style={{ textAlign: 'center' }}
                          title={done ? `Done ${fmtDate(cell?.done_at)}` : overdue ? 'Overdue' : 'Pending'}>
                          <span aria-label={done ? 'done' : overdue ? 'overdue' : 'pending'} style={{
                            display: 'inline-flex', width: 22, height: 22, borderRadius: '50%',
                            alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                            background: done ? 'var(--ok-soft)' : overdue ? 'var(--danger-soft)' : 'var(--surface-3)',
                            color: done ? 'var(--ok)' : overdue ? 'var(--danger)' : 'var(--faint)',
                          }}>
                            {done ? '✓' : overdue ? '!' : '·'}
                          </span>
                        </td>
                      )
                    })}
                    <td>
                      {row.overdue_count > 0
                        ? <Badge tone="badge-danger">{row.overdue_count} overdue</Badge>
                        : row.complete
                          ? <Badge tone="badge-ok">ready</Badge>
                          : <Badge>{row.done_count}/{tasks.length}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
