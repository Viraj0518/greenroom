import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../api'
import { useOrg } from './OrgLayout'
import type { QueueRow, Review, ReviewRound, Rubric } from '../../types'
import { asObj, rubric as getRubric } from '../../types'
import { cx } from '../../lib'
import { Badge, Button, Card, EmptyState, Progress, Select, Spinner, Textarea, useToast } from '../../components/ui'

export function ReviewPage() {
  const { event } = useOrg()
  const [rounds, setRounds] = useState<ReviewRound[] | null>(null)
  const [roundId, setRoundId] = useState<string>('')
  const [queue, setQueue] = useState<QueueRow[] | null>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    api.listRounds(event.id).then((rs) => {
      setRounds(rs)
      if (rs.length > 0) setRoundId((cur) => cur || rs[0].id)
    })
  }, [event.id])

  useEffect(() => {
    if (!roundId) return
    setQueue(null)
    api.reviewQueue(roundId).then((r) => { setQueue(r.queue); setIdx(0) })
  }, [roundId])

  const round = rounds?.find((r) => r.id === roundId)
  const rubric = round ? getRubric(round) : { criteria: [] }

  if (!rounds) return <Spinner />
  if (rounds.length === 0) return <EmptyState title="No review rounds yet">Create one from the API or ask an admin.</EmptyState>

  const item = queue?.[idx]
  const reviewedCount = queue?.filter((i) => i.my_review).length ?? 0

  return (
    <>
      <div className="page-title">
        <h1>Review queue</h1>
        <div className="row">
          <Select value={roundId} onChange={(e) => setRoundId(e.target.value)} aria-label="Review round">
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          {queue && <span className="muted small">{reviewedCount}/{queue.length} reviewed by you</span>}
        </div>
      </div>

      {round && queue && queue.length > 0 && (
        <Card className="card-pad" pad={false}>
          <div className="spread" style={{ padding: '12px 18px', gap: 18, flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 10 }}>
              <strong>{round.name}</strong>
              {round.is_open ? <Badge tone="badge-ok">open</Badge> : <Badge>closed</Badge>}
            </span>
            <span className="row grow" style={{ gap: 10, maxWidth: 420 }}>
              <div className="grow"><Progress value={reviewedCount} max={queue.length} /></div>
              <span className="muted small" style={{ flex: 'none' }}>
                {Math.round((reviewedCount / queue.length) * 100)}% reviewed
              </span>
            </span>
          </div>
        </Card>
      )}
      <div style={{ height: 14 }} />

      {!queue ? <Spinner /> : queue.length === 0 ? (
        <EmptyState glyph="✓" title="Queue is empty">Nothing awaiting review in this round.</EmptyState>
      ) : (
        <div className="review-layout">
          <Card pad={false} className="review-list">
            <ul style={{ listStyle: 'none', padding: '6px 0', margin: 0, maxHeight: '70vh', overflowY: 'auto' }}>
              {queue.map((it, i) => (
                <li key={it.id}>
                  <button onClick={() => setIdx(i)} className={cx('review-item', i === idx && 'sel')}>
                    <span className="row" style={{ gap: 7 }}>
                      <span aria-hidden style={{ color: it.my_review ? 'var(--ok)' : 'var(--faint)', flex: 'none' }}>
                        {it.my_review ? '✓' : '○'}
                      </span>
                      <span className="truncate small">
                        {it.title}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {item && (
            <ReviewPanel key={item.id} item={item} roundId={roundId} rubric={rubric}
              onSaved={(rev) => {
                setQueue((q) => q?.map((x) => (x.id === item.id
                  ? {
                    ...x,
                    my_review: {
                      id: rev.id,
                      scores: asObj<Record<string, number>>(rev.scores_json, {}),
                      comment: rev.comment,
                    },
                  }
                  : x)) ?? null)
                if (queue && idx < queue.length - 1) setIdx(idx + 1)
              }} />
          )}
        </div>
      )}
    </>
  )
}

function ReviewPanel({ item, roundId, rubric, onSaved }: {
  item: QueueRow; roundId: string; rubric: Rubric
  onSaved: (r: Review) => void
}) {
  const toast = useToast()
  const [scores, setScores] = useState<Record<string, number>>(item.my_review?.scores ?? {})
  const [comment, setComment] = useState(item.my_review?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiReview, setAiReview] = useState<Review | null>(null)

  const total = useMemo(
    () => rubric.criteria.reduce((a, c) => a + (scores[c.key] ?? 0), 0),
    [scores, rubric],
  )
  const maxTotal = rubric.criteria.reduce((a, c) => a + c.max, 0)
  const complete = rubric.criteria.every((c) => scores[c.key] != null)

  async function save() {
    setBusy(true)
    try {
      const rev = await api.submitReview(roundId, item.id, { scores_json: scores, comment })
      toast('Review saved ✓')
      onSaved(rev)
    } catch {
      toast('Could not save the review', { error: true })
    } finally { setBusy(false) }
  }

  async function runAi() {
    setAiBusy(true)
    try {
      const rev = await api.aiReview(roundId, item.id)
      setAiReview(rev)
      toast('AI review complete')
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'ai_not_configured'
        ? 'AI review is not configured on this deployment (set ANTHROPIC_API_KEY).'
        : 'AI review failed — try again.', { error: true })
    } finally { setAiBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card>
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div>
            <h2>{item.title}</h2>
            <p className="muted small" style={{ marginTop: 3 }}>
              {item.speaker_name}{item.speaker_company ? ` · ${item.speaker_company}` : ''}
              {item.category ? <> · <Badge>{item.category}</Badge></> : null}
            </p>
          </div>
        </div>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{item.abstract}</p>
      </Card>

      <Card title="Your score" actions={
        <span className="muted small">{complete ? `${total}/${maxTotal}` : `${total} so far`}</span>
      }>
        <div className="stack" style={{ gap: 14 }}>
          {rubric.criteria.map((c) => (
            <div key={c.key} className="spread" style={{ flexWrap: 'wrap' }}>
              <div>
                <strong className="small">{c.label}</strong>
                {c.description && <p className="faint small">{c.description}</p>}
              </div>
              <div className="row" style={{ gap: 4 }} role="radiogroup" aria-label={c.label}>
                {Array.from({ length: c.max }, (_, i) => i + 1).map((v) => (
                  <button key={v} role="radio" aria-checked={scores[c.key] === v}
                    onClick={() => setScores((sc) => ({ ...sc, [c.key]: v }))}
                    className={cx('score-btn',
                      scores[c.key] === v && 'on',
                      (scores[c.key] ?? 0) >= v && 'fill')}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Textarea placeholder="Comments for the program committee (speakers never see these)…"
            value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 80 }} />
          <div className="row-wrap">
            <Button variant="primary" busy={busy} disabled={!complete} onClick={save}>
              {item.my_review ? 'Update review' : 'Save & next'}
            </Button>
            <Button busy={aiBusy} onClick={runAi} title="Ask the AI reviewer to score this abstract">
              ✨ Run AI review
            </Button>
          </div>
        </div>
      </Card>

      {aiReview && (
        <Card title={<span>✨ AI review <Badge tone="badge-accent">ai</Badge></span>}>
          <div className="row-wrap" style={{ marginBottom: 8 }}>
            {Object.entries(asObj<Record<string, number>>(aiReview.scores_json, {})).map(([k, v]) => (
              <Badge key={k}>{k}: {v}</Badge>
            ))}
          </div>
          <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{aiReview.comment}</p>
        </Card>
      )}
    </div>
  )
}
