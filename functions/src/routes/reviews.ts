import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { ApiError, readBody, requireString, optionalString, optionalFlag, badRequest, notFound, notConfigured } from '../lib/http'
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
  const body = await readBody(c.req.raw, ['name', 'round_no', 'rubric', 'is_open'])
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
    optionalFlag(body, 'is_open') ?? 1
  )
  const row = await one<RoundRow>(c.env.DB, 'SELECT * FROM review_rounds WHERE id = ?', id)
  return c.json(withRubric(row!), 201)
})

reviews.patch('/rounds/:roundId', async (c) => {
  const id = c.req.param('roundId')
  const existing = await one<RoundRow>(c.env.DB, 'SELECT * FROM review_rounds WHERE id = ?', id)
  if (!existing) throw notFound('Round not found')
  const body = await readBody(c.req.raw, ['name', 'round_no', 'rubric', 'is_open'])
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
  const isOpenFlag = optionalFlag(body, 'is_open')
  if (isOpenFlag !== undefined) {
    updates.push('is_open = ?')
    binds.push(isOpenFlag)
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
  return c.json(withRubric(row!))
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
  const body = await readBody(c.req.raw, ['scores_json', 'comment'])
  // Pin #5: scores_json arrives in object form; the *_json string shape is DB-internal.
  const scores = body.scores_json
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    throw badRequest('scores_json must be an object of numeric scores', 'missing_scores')
  }
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
  return c.json(row)
})

// AI-assisted review; 501 with a clean message when ANTHROPIC_API_KEY is absent.
reviews.post('/rounds/:roundId/submissions/:sid/ai-review', async (c) => {
  const reviewer = getAIReviewer(c.env)
  if (!reviewer) {
    throw notConfigured('AI review is not configured: set ANTHROPIC_API_KEY to enable it', 'ai_not_configured')
  }
  const { round, submission } = await loadRoundSubmission(c.env.DB, c.req.param('roundId'), c.req.param('sid'))
  let result
  try {
    result = await reviewer.review({
      title: submission.title,
      abstract: submission.abstract,
      category: submission.category,
      answers: parseJson(submission.answers_json, {}),
      rubric: parseJson(round.rubric_json, null),
    })
  } catch (err) {
    // A misbehaving upstream (bad key, model error, malformed output) must surface as a
    // clean 502, never a 500 — config absence is already the 501 above.
    throw new ApiError(502, 'ai_error', `AI reviewer (${reviewer.name}) failed: ${String(err).slice(0, 300)}`)
  }
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
  return c.json(row)
})

// Leaderboard — response shape per Pinned decisions #3:
// { round_id, rows: [{submission_id, title, category, track, speaker_name,
//   review_count, ai_review_count, score}] }
// score = mean of per-review totals (sum of numeric scores_json values), AI included,
// 2dp, null when 0 reviews; sort score DESC nulls last, tie-break title ASC.
reviews.get('/events/:eventId/leaderboard', async (c) => {
  const eventId = c.req.param('eventId')
  const roundId = c.req.query('round') || null

  const submissions = await all<{
    id: string
    title: string
    category: string | null
    track: string | null
    speaker_name: string
  }>(
    c.env.DB,
    `SELECT s.id, s.title, s.category, s.track, sp.name AS speaker_name
     FROM submissions s JOIN speakers sp ON sp.id = s.speaker_id
     WHERE s.event_id = ?`,
    eventId
  )

  let sql = `SELECT r.submission_id, r.scores_json, r.ai
             FROM reviews r JOIN submissions s ON s.id = r.submission_id
             WHERE s.event_id = ?`
  const binds: unknown[] = [eventId]
  if (roundId) {
    sql += ' AND r.round_id = ?'
    binds.push(roundId)
  }
  const reviewRows = await all<{ submission_id: string; scores_json: string; ai: number }>(
    c.env.DB,
    sql,
    ...binds
  )

  const agg = new Map<string, { total: number; count: number; aiCount: number }>()
  for (const r of reviewRows) {
    const entry = agg.get(r.submission_id) ?? { total: 0, count: 0, aiCount: 0 }
    let reviewTotal = 0
    for (const v of Object.values(parseJson<Record<string, unknown>>(r.scores_json, {}))) {
      if (typeof v === 'number' && Number.isFinite(v)) reviewTotal += v
    }
    entry.total += reviewTotal
    entry.count += 1
    if (r.ai) entry.aiCount += 1
    agg.set(r.submission_id, entry)
  }

  const rows = submissions
    .map((s) => {
      const a = agg.get(s.id)
      return {
        submission_id: s.id,
        title: s.title,
        category: s.category,
        track: s.track,
        speaker_name: s.speaker_name,
        review_count: a?.count ?? 0,
        ai_review_count: a?.aiCount ?? 0,
        score: a && a.count > 0 ? Math.round((a.total / a.count) * 100) / 100 : null,
      }
    })
    .sort((a, b) => {
      if (a.score === null && b.score === null) return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
      if (a.score === null) return 1
      if (b.score === null) return -1
      if (b.score !== a.score) return b.score - a.score
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
    })

  return c.json({ round_id: roundId, rows })
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
