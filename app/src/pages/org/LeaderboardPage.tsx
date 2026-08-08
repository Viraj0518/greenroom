import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { LeaderboardResponse, ReviewRound } from '../../types'
import { Badge, Card, EmptyState, Select, Spinner } from '../../components/ui'

export function LeaderboardPage() {
  const { event } = useOrg()
  const [rounds, setRounds] = useState<ReviewRound[]>([])
  const [roundId, setRoundId] = useState('')
  const [data, setData] = useState<LeaderboardResponse | null>(null)

  useEffect(() => {
    api.listRounds(event.id).then((rs) => {
      setRounds(rs)
      if (rs.length > 0) setRoundId((cur) => cur || rs[0].id)
    })
  }, [event.id])

  useEffect(() => {
    setData(null)
    api.leaderboard(event.id, roundId || undefined).then(setData)
  }, [event.id, roundId])

  const top = data?.rows.find((r) => r.score != null)?.score ?? 0

  return (
    <>
      <div className="page-title">
        <h1>Leaderboard</h1>
        {rounds.length > 1 && (
          <Select value={roundId} onChange={(e) => setRoundId(e.target.value)} aria-label="Round">
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        )}
      </div>

      {!data ? <Spinner /> : data.rows.length === 0 ? (
        <EmptyState glyph="🏁" title="Nothing scored yet">Reviews will appear here as they come in.</EmptyState>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="gr">
              <thead>
                <tr><th style={{ width: 40 }}>#</th><th>Title</th><th>Speaker</th><th>Track</th><th>Reviews</th><th style={{ width: 200 }}>Score</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.submission_id}>
                    <td className="muted">{r.score != null ? i + 1 : '—'}</td>
                    <td style={{ maxWidth: 340 }}><strong>{r.title}</strong>
                      {r.category && <div className="faint small">{r.category}</div>}
                    </td>
                    <td>{r.speaker_name}</td>
                    <td>{r.track ? <Badge>{r.track}</Badge> : <span className="faint">—</span>}</td>
                    <td className="small muted">
                      {r.review_count}
                      {r.ai_review_count > 0 && <> + <Badge tone="badge-accent">✨ {r.ai_review_count} AI</Badge></>}
                    </td>
                    <td>
                      {r.score == null ? <span className="faint small">no reviews</span> : (
                        <div className="row" style={{ gap: 8 }}>
                          <div className="progress grow" style={{ minWidth: 80 }}>
                            <div style={{ width: `${top ? (r.score / top) * 100 : 0}%` }} />
                          </div>
                          <strong style={{ minWidth: 44, textAlign: 'right' }}>{r.score.toFixed(2)}</strong>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
