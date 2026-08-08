import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { readJson, requireString, optionalString, badRequest, notFound, notConfigured } from '../lib/http'
import { all, one, run, uuid, now, parseJson } from '../lib/db'
import { requireOrganizer } from '../lib/auth'
import { getAIReviewer } from '../ai/reviewer'

interface RoundRow {
  id: string
  event_id: string
  name: string
  round_no: number
  rubric_json: string | null
  is_open: number
}

const reviews = new Hono<AppEnv>()

reviews.use('/events/:eventId/rounds', requireOrganizer)
reviews.use('/events/:eventId/rounds/*', requireOrganizer)
reviews.use('/rounds/*', requireOrganizer)
reviews.use('/events/:eventId/leaderboard', requireOrganizer)

reviews.get('/events/:eventId/rounds', async (c) => {
  const rows = await all<RoundRow>(
    c.env.DB,
    'SELECT * FROM review_rounds WHERE event_id = ? ORDER BY round_no',
    c.req.param('eventId')
  )
  return c.json({ rounds: rows.map(withRubric) })
})

reviews.post('/events/:eventId/rounds', async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const body = await readJson(c.req.raw)
  const name = requireString(body, 'name', { max: 200 })
  const maxNo = await one<{ n: number | null }>(
    c.env.DB,
    'SELECT MAX(round_no) AS n FROM review_rounds WHERE event_id = ?',
    eventId
  )
  const id = uuid()
  await run(
    c.env.DB,
    'INSERT INTO review_rounds (id, event_id, name, round_no, rubric_json, is_open) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    eventId,
    name,
    typeof body.round_no === 'number' ? body.round_no : (maxNo?.n ?? 0) + 1,
    body.rubric !== undefined ? JSON.stringify(body.rubric) : null,
    body.is_open === false ? 0 : 1
  )
  const row = await one<RoundRow>(c.env.DB, 'SELECT * FROM review_rounds WHERE id = ?', id)
  return c.json({ round: withRubric(row!) }, 201)
})

reviews.patch('/rounds/:roundId', async (c) => {
  const id = c.req.param('roundId')
  const existing = await one<RoundRow>(c.env.DB, 'SELECT * FROM review_rounds WHERE id = ?', id)
  if (!existing) throw notFound('Round not found')
  const body = await readJson(c.req.raw)
  const updates: string[] = []
  const binds: unknown[] = []
  const name = optionalString(body, 'name')
  if (name !== undefined) {
    updates.push('name = ?')
    binds.push(name)
  }
  if (typeof body.round_no === 'number') {
    updates.push('round_no = ?')
    binds.push(body.round_no)
  }
  if (typeof body.is_open === 'boolean') {
    updates.push('is_open = ?')
    binds.push(body.is_open ? 1 : 0)
  }
  if (body.rubric !== undefined) {
    updates.push('rubric_json = ?')
    binds.push(body.rubric === null ? null : JSON.stringify(body.rubric))
  }
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE review_rounds SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one<RoundRow>(c.env.DB, 'SELECT * FROM review_rounds WHERE id = ?', id)
  return c.json({ round: withRubric(row!) })
})

// Review queue: reviewable submissions plus the caller's existing review this round.
reviews.get('/rounds/:roundId/queue', async (c) => {
  const round = await one<RoundRow>(c.env.DB, 'SELECT * FROM review_rounds WHERE id = ?', c.req.param('roundId'))
  if (!round) throw notFound('Round not found')
  const me = c.get('user')!
  const rows = await all<Record<string, unknown>>(
    c.env.DB,
    `SELECT s.id, s.title, s.abstract, s.category, s.track, s.status, s.answers_json,
            sp.name AS speaker_name, sp.company AS speaker_company,
            r.id AS my_review_id, r.scores_json AS my_scores_json, r.comment AS my_comment
     FROM submissions s
     JOIN speakers sp ON sp.id = s.speaker_id
     LEFT JOIN reviews r ON r.submission_id = s.id AND r.round_id = ? AND r.reviewer_id = ?
     WHERE s.event_id = ? AND s.status IN ('submitted', 'in_review')
     ORDER BY s.created_at`,
    round.id,
    me.id,
    round.event_id
  )
  return c.json({
    round: withRubric(round),
    queue: rows.map((r) => ({
      ...r,
      answers: parseJson(r.answers_json as string, {}),
      answers_json: undefined,
      my_review: r.my_review_id
        ? { id: r.my_review_id, scores: parseJson(r.my_scores_json as string, {}), comment: r.my_comment }
        : null,
      my_review_id: undefined,
      my_scores_json: undefined,
      my_comment: undefined,
    })),
  })
})

reviews.post('/rounds/:roundId/submissions/:sid/review', async (c) => {
  const { round, submission } = await loadRoundSubmission(c.env.DB, c.req.param('roundId'), c.req.param('sid'))
  if (!round.is_open) throw badRequest('This round is closed', 'round_closed')
  const me = c.get('user')!
  const body = await readJson(c.req.raw)
  const scores = body.scores_json ?? body.scores
  if (!scores || typeof scores !== 'object') throw badRequest('Missing scores_json', 'missing_scores')
  for (const [k, v] of Object.entries(scores as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw badRequest(`Score "${k}" must be a number`, 'invalid_score')
    }
  }
  const comment = optionalString(body, 'comment') ?? null
  await upsertReview(c.env.DB, round.id, submission.id, me.id, 0, JSON.stringify(scores), comment)
  if (submission.status === 'submitted') {
    await run(c.env.DB, "UPDATE submissions SET status = 'in_review' WHERE id = ?", submission.id)
  }
  const row = await one<Record<string, unknown>>(
    c.env.DB,
    'SELECT * FROM reviews WHERE round_id = ? AND submission_id = ? AND reviewer_id = ?',
    round.id,
    submission.id,
    me.id
  )
  return c.json({ review: row })
})

// AI-assisted review; 501 with a clean message when ANTHROPIC_API_KEY is absent.
reviews.post('/rounds/:roundId/submissions/:sid/ai-review', async (c) => {
  const reviewer = getAIReviewer(c.env)
  if (!reviewer) {
    throw notConfigured('AI review is not configured: set ANTHROPIC_API_KEY to enable it', 'ai_not_configured')
  }
  const { round, submission } = await loadRoundSubmission(c.env.DB, c.req.param('roundId'), c.req.param('sid'))
  const result = await reviewer.review({
    title: submission.title,
    abstract: submission.abstract,
    category: submission.category,
    answers: parseJson(submission.answers_json, {}),
    rubric: parseJson(round.rubric_json, null),
  })
  await upsertReview(c.env.DB, round.id, submission.id, 'ai', 1, JSON.stringify(result.scores), result.comment)
  if (submission.status === 'submitted') {
    await run(c.env.DB, "UPDATE submissions SET status = 'in_review' WHERE id = ?", submission.id)
  }
  const row = await one<Record<string, unknown>>(
    c.env.DB,
    "SELECT * FROM reviews WHERE round_id = ? AND submission_id = ? AND reviewer_id = 'ai'",
    round.id,
    submission.id
  )
  return c.json({ review: row })
})

// Leaderboard: average total score per submission (optionally scoped to one round).
reviews.get('/events/:eventId/leaderboard', async (c) => {
  const eventId = c.req.param('eventId')
  const roundId = c.req.query('round')
  let sql = `SELECT r.id AS review_id, r.round_id, r.submission_id, r.scores_json, r.ai,
                    s.title, s.status, s.track, s.category, sp.name AS speaker_name
             FROM reviews r
             JOIN submissions s ON s.id = r.submission_id
             JOIN speakers sp ON sp.id = s.speaker_id
             WHERE s.event_id = ?`
  const binds: unknown[] = [eventId]
  if (roundId) {
    sql += ' AND r.round_id = ?'
    binds.push(roundId)
  }
  const rows = await all<{
    review_id: string
    submission_id: string
    scores_json: string
    ai: number
    title: string
    status: string
    track: string | null
    category: string | null
    speaker_name: string
  }>(c.env.DB, sql, ...binds)

  const bySubmission = new Map<
    string,
    {
      submission_id: string
      title: string
      status: string
      track: string | null
      category: string | null
      speaker_name: string
      review_count: number
      ai_review_count: number
      total: number
      criteria: Record<string, { total: number; count: number }>
    }
  >()
  for (const row of rows) {
    let entry = bySubmission.get(row.submission_id)
    if (!entry) {
      entry = {
        submission_id: row.submission_id,
        title: row.title,
        status: row.status,
        track: row.track,
        category: row.category,
        speaker_name: row.speaker_name,
        review_count: 0,
        ai_review_count: 0,
        total: 0,
        criteria: {},
      }
      bySubmission.set(row.submission_id, entry)
    }
    const scores = parseJson<Record<string, number>>(row.scores_json, {})
    let reviewTotal = 0
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      reviewTotal += v
      entry.criteria[k] = entry.criteria[k] ?? { total: 0, count: 0 }
      entry.criteria[k].total += v
      entry.criteria[k].count += 1
    }
    entry.total += reviewTotal
    entry.review_count += 1
    if (row.ai) entry.ai_review_count += 1
  }

  const leaderboard = [...bySubmission.values()]
    .map((e) => ({
      submission_id: e.submission_id,
      title: e.title,
      speaker_name: e.speaker_name,
      status: e.status,
      track: e.track,
      category: e.category,
      review_count: e.review_count,
      ai_review_count: e.ai_review_count,
      avg_score: e.review_count ? Math.round((e.total / e.review_count) * 100) / 100 : 0,
      criteria_avg: Object.fromEntries(
        Object.entries(e.criteria).map(([k, v]) => [k, Math.round((v.total / v.count) * 100) / 100])
      ),
    }))
    .sort((a, b) => b.avg_score - a.avg_score)

  return c.json({ leaderboard })
})

// --- helpers ---

function withRubric(row: RoundRow) {
  return { ...row, rubric: parseJson(row.rubric_json, null), rubric_json: undefined }
}

async function loadRoundSubmission(db: AppEnv['Bindings']['DB'], roundId: string, sid: string) {
  const round = await one<RoundRow>(db, 'SELECT * FROM review_rounds WHERE id = ?', roundId)
  if (!round) throw notFound('Round not found')
  const submission = await one<{
    id: string
    event_id: string
    title: string
    abstract: string | null
    category: string | null
    answers_json: string | null
    status: string
  }>(db, 'SELECT * FROM submissions WHERE id = ?', sid)
  if (!submission || submission.event_id !== round.event_id) throw notFound('Submission not found in this round')
  return { round, submission }
}

async function upsertReview(
  db: AppEnv['Bindings']['DB'],
  roundId: string,
  submissionId: string,
  reviewerId: string,
  ai: 0 | 1,
  scoresJson: string,
  comment: string | null
) {
  const existing = await one<{ id: string }>(
    db,
    'SELECT id FROM reviews WHERE round_id = ? AND submission_id = ? AND reviewer_id = ?',
    roundId,
    submissionId,
    reviewerId
  )
  if (existing) {
    await run(db, 'UPDATE reviews SET scores_json = ?, comment = ?, ai = ? WHERE id = ?', scoresJson, comment, ai, existing.id)
  } else {
    await run(
      db,
      'INSERT INTO reviews (id, round_id, submission_id, reviewer_id, scores_json, comment, ai, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      uuid(),
      roundId,
      submissionId,
      reviewerId,
      scoresJson,
      comment,
      ai,
      now()
    )
  }
}

export default reviews
