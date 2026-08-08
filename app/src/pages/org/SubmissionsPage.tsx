import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { Submission, SubmissionStatus, Track } from '../../types'
import { STATUS_BADGE, STATUS_LABELS, asObj } from '../../types'
import { fmtDate } from '../../lib'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner, useToast } from '../../components/ui'

const STATUSES = Object.keys(STATUS_LABELS) as SubmissionStatus[]

export function SubmissionsPage() {
  const { event } = useOrg()
  const toast = useToast()
  const [subs, setSubs] = useState<Submission[] | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [status, setStatus] = useState('')
  const [track, setTrack] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Submission | null>(null)

  const load = useCallback(() => {
    api.listSubmissions(event.id, { status, track, q }).then(setSubs)
  }, [event.id, status, track, q])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.listTracks(event.id).then(setTracks) }, [event.id])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of subs ?? []) c[s.status] = (c[s.status] ?? 0) + 1
    return c
  }, [subs])

  async function setSubStatus(s: Submission, newStatus: SubmissionStatus) {
    const updated = await api.updateSubmission(s.id, { status: newStatus })
    setSubs((list) => list?.map((x) => (x.id === s.id ? { ...x, ...updated } : x)) ?? null)
    setOpen((o) => (o?.id === s.id ? { ...o, ...updated } : o))
    toast(`“${s.title}” → ${STATUS_LABELS[newStatus]}`)
  }

  return (
    <>
      <div className="page-title">
        <h1>Submissions</h1>
        <div className="row-wrap">
          {STATUSES.filter((st) => counts[st]).map((st) => (
            <button key={st} className="badge" style={{ cursor: 'pointer', border: status === st ? '1px solid var(--accent)' : undefined }}
              onClick={() => setStatus(status === st ? '' : st)}>
              {STATUS_LABELS[st]} {counts[st]}
            </button>
          ))}
        </div>
      </div>

      <Card pad={false}>
        <div className="row-wrap" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <Input placeholder="Search title or speaker…" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 260 }} aria-label="Search submissions" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 160 }} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
          <Select value={track} onChange={(e) => setTrack(e.target.value)} style={{ maxWidth: 160 }} aria-label="Filter by track">
            <option value="">All tracks</option>
            {tracks.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </Select>
        </div>

        {!subs ? <Spinner /> : subs.length === 0 ? (
          <EmptyState glyph="🔍" title="No submissions match">Adjust the filters or share the CFP link.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="gr">
              <thead>
                <tr>
                  <th>Title</th><th>Speaker</th><th>Track</th><th>Status</th><th>Submitted</th><th></th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                    <td style={{ maxWidth: 320 }} className="truncate"><strong>{s.title}</strong></td>
                    <td>{s.speaker_name ?? '—'}<div className="faint small">{s.speaker_company}</div></td>
                    <td>{s.track ? <Badge>{s.track}</Badge> : <span className="faint">—</span>}</td>
                    <td><Badge tone={STATUS_BADGE[s.status]}>{STATUS_LABELS[s.status]}</Badge></td>
                    <td className="muted small">{fmtDate(s.created_at)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {s.status !== 'accepted' && s.status !== 'rejected' && (
                        <span className="row" style={{ gap: 6 }}>
                          <Button size="sm" onClick={() => setSubStatus(s, 'accepted')} title="Accept">✓</Button>
                          <Button size="sm" variant="danger" onClick={() => setSubStatus(s, 'rejected')} title="Reject">✕</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} wide
        footer={open ? (
          <>
            <div className="row-wrap">
              {STATUSES.map((st) => (
                <Button key={st} size="sm" variant={open.status === st ? 'primary' : 'default'}
                  onClick={() => setSubStatus(open, st)}>
                  {STATUS_LABELS[st]}
                </Button>
              ))}
            </div>
          </>
        ) : undefined}>
        {open && <SubmissionDetail s={open} tracks={tracks} onTrack={async (tr) => {
          const updated = await api.updateSubmission(open.id, { track: tr })
          setSubs((list) => list?.map((x) => (x.id === open.id ? { ...x, ...updated } : x)) ?? null)
          setOpen({ ...open, ...updated })
        }} />}
      </Modal>
    </>
  )
}

function SubmissionDetail({ s, tracks, onTrack }: {
  s: Submission; tracks: Track[]; onTrack: (track: string) => void
}) {
  const answers = asObj<Record<string, unknown>>(s.answers_json, {})
  const extra = Object.entries(answers).filter(([k]) => !['title', 'abstract'].includes(k))
  return (
    <div className="stack">
      <div className="row-wrap muted small">
        <span><strong>{s.speaker_name}</strong> · {s.speaker_email}</span>
        {s.category && <Badge>{s.category}</Badge>}
        <span className="row" style={{ gap: 6 }}>
          Track:
          <Select value={s.track ?? ''} onChange={(e) => onTrack(e.target.value)} style={{ width: 150, padding: '3px 8px' }}>
            <option value="">—</option>
            {tracks.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </Select>
        </span>
      </div>
      <div>
        <h3 className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Abstract</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{s.abstract || <span className="faint">No abstract.</span>}</p>
      </div>
      {extra.length > 0 && (
        <div>
          <h3 className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Answers</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', margin: 0 }}>
            {extra.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt className="muted small mono">{k}</dt>
                <dd style={{ margin: 0 }}>{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
