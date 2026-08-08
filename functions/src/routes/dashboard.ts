import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { notFound } from '../lib/http'
import { all, one, now } from '../lib/db'
import { requireOrganizer } from '../lib/auth'

const dashboard = new Hono<AppEnv>()

// Per-speaker onboarding status matrix + counts + overdue list.
dashboard.get('/events/:eventId/dashboard', requireOrganizer, async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')

  const [tasks, speakers, doneRows, submissionCounts] = await Promise.all([
    all<{ key: string; label: string; due_at: string | null; required: number }>(
      c.env.DB,
      'SELECT key, label, due_at, required FROM onboarding_tasks WHERE event_id = ? ORDER BY due_at IS NULL, due_at',
      eventId
    ),
    all<{ id: string; name: string; email: string; company: string | null; headshot_key: string | null }>(
      c.env.DB,
      `SELECT DISTINCT sp.id, sp.name, sp.email, sp.company, sp.headshot_key
       FROM speakers sp
       WHERE sp.event_id = ?
       ORDER BY sp.name`,
      eventId
    ),
    all<{ speaker_id: string; task_key: string; done: number; done_at: string | null }>(
      c.env.DB,
      `SELECT st.speaker_id, st.task_key, st.done, st.done_at
       FROM speaker_tasks st JOIN speakers sp ON sp.id = st.speaker_id
       WHERE sp.event_id = ?`,
      eventId
    ),
    all<{ status: string; n: number }>(
      c.env.DB,
      'SELECT status, COUNT(*) AS n FROM submissions WHERE event_id = ? GROUP BY status',
      eventId
    ),
  ])

  const doneMap = new Map<string, { done: boolean; done_at: string | null }>()
  for (const row of doneRows) {
    doneMap.set(`${row.speaker_id}|${row.task_key}`, { done: !!row.done, done_at: row.done_at })
  }

  const t = now()
  const rows = speakers.map((sp) => {
    const cells: Record<string, { done: boolean; done_at: string | null; overdue: boolean }> = {}
    let doneCount = 0
    let overdueCount = 0
    for (const task of tasks) {
      const cell = doneMap.get(`${sp.id}|${task.key}`) ?? { done: false, done_at: null }
      const overdue = !cell.done && !!task.due_at && task.due_at < t
      if (cell.done) doneCount++
      if (overdue) overdueCount++
      cells[task.key] = { ...cell, overdue }
    }
    return {
      speaker: sp,
      tasks: cells,
      done_count: doneCount,
      overdue_count: overdueCount,
      complete: tasks.length > 0 && doneCount === tasks.length,
    }
  })

  const overdueTotal = rows.reduce((n, r) => n + r.overdue_count, 0)
  return c.json({
    tasks,
    speakers: rows,
    counts: {
      speakers: speakers.length,
      tasks: tasks.length,
      complete_speakers: rows.filter((r) => r.complete).length,
      overdue: overdueTotal,
      submissions_by_status: Object.fromEntries(submissionCounts.map((r) => [r.status, r.n])),
    },
  })
})

export default dashboard
