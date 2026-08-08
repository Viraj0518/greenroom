import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { DashboardData, Submission, Track } from '../../types'
import { STATUS_LABELS } from '../../types'
import { fmtDate, isOverdue } from '../../lib'
import { Avatar, Badge, Button, Card, EmptyState, Spinner } from '../../components/ui'

// Composition mirrors the reference product's home: stat row → pipeline funnel
// + track distribution → speaker-tasks matrix with per-row remind actions.

const FUNNEL_STAGES = ['submitted', 'in_review', 'accepted'] as const

export function DashboardPage() {
  const { event } = useOrg()
  const nav = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [subs, setSubs] = useState<Submission[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [err, setErr] = useState(false)

  useEffect(() => {
    api.dashboard(event.id).then(setData).catch(() => setErr(true))
    api.listSubmissions(event.id).then(setSubs).catch(() => {})
    api.listTracks(event.id).then(setTracks).catch(() => {})
  }, [event.id])

  const byTrack = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of subs.filter((x) => x.status === 'accepted')) {
      m.set(s.track ?? 'Unassigned', (m.get(s.track ?? 'Unassigned') ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [subs])

  if (err) return <EmptyState glyph="⚠️" title="Could not load the dashboard">Try reloading.</EmptyState>
  if (!data) return <Spinner label="Loading dashboard…" />

  const tasks = data.tasks ?? []
  const rows = data.speakers ?? []
  const counts = data.counts
  const byStatus = counts.submissions_by_status ?? {}
  const submissionsTotal = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const funnelMax = Math.max(...FUNNEL_STAGES.map((s) => byStatus[s] ?? 0), 1)
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

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 18 }}>
        <Card title="Submission pipeline">
          <div className="stack" style={{ gap: 10 }}>
            {FUNNEL_STAGES.map((st) => {
              const n = byStatus[st] ?? 0
              return (
                <div key={st} className="funnel-row">
                  <span className="stage">{STATUS_LABELS[st]}</span>
                  <div className="funnel-track">
                    <div
                      className={st === 'accepted' ? 'funnel-fill final' : 'funnel-fill'}
                      style={{ width: `${(n / funnelMax) * 100}%`, minWidth: n > 0 ? 6 : 0 }}
                    />
                  </div>
                  <span className="count">{n}</span>
                </div>
              )
            })}
            {(byStatus.waitlisted || byStatus.rejected || byStatus.withdrawn) ? (
              <p className="faint small">
                {byStatus.waitlisted ? `${byStatus.waitlisted} waitlisted · ` : ''}
                {byStatus.rejected ? `${byStatus.rejected} rejected · ` : ''}
                {byStatus.withdrawn ? `${byStatus.withdrawn} withdrawn` : ''}
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="Accepted talks by track">
          {byTrack.length === 0 ? (
            <p className="muted small">Accept submissions to see track balance.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {byTrack.map(([name, n]) => {
                const color = tracks.find((t) => t.name === name)?.color
                return (
                  <div key={name} className="spread small">
                    <span className="row" style={{ gap: 7 }}>
                      <span className="dot" style={{ background: color ?? 'var(--faint)' }} />
                      {name}
                    </span>
                    <strong>{n}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
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
                  <th></th>
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
                          <span
                            aria-label={done ? 'done' : overdue ? 'overdue' : 'pending'}
                            className={`task-dot ${done ? 'done' : overdue ? 'overdue' : 'pending'}`}
                          >
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
                    <td>
                      {!row.complete && (
                        <Button size="sm" title="Send a reminder from Comms"
                          onClick={() => nav(`/org/comms?speakers=${row.speaker.id}`)}>
                          Remind
                        </Button>
                      )}
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
