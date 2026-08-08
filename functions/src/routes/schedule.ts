import { Hono } from 'hono'
import type { AppEnv, D1Database } from '../types'
import { readJson, requireString, optionalString, badRequest, notFound } from '../lib/http'
import { all, one, run, uuid } from '../lib/db'
import { requireOrganizer } from '../lib/auth'
import { computeConflicts, type SlotForConflicts } from '../lib/conflicts'

const schedule = new Hono<AppEnv>()

schedule.use('/events/:eventId/rooms', requireOrganizer)
schedule.use('/events/:eventId/tracks', requireOrganizer)
schedule.use('/events/:eventId/schedule', requireOrganizer)
schedule.use('/events/:eventId/schedule/*', requireOrganizer)
schedule.use('/rooms/*', requireOrganizer)
schedule.use('/tracks/*', requireOrganizer)
schedule.use('/slots/*', requireOrganizer)

// --- rooms & tracks ---

for (const kind of ['rooms', 'tracks'] as const) {
  schedule.get(`/events/:eventId/${kind}`, async (c) => {
    const rows = await all(
      c.env.DB,
      `SELECT * FROM ${kind} WHERE event_id = ? ORDER BY sort, name`,
      c.req.param('eventId')
    )
    return c.json({ [kind]: rows })
  })

  schedule.post(`/events/:eventId/${kind}`, async (c) => {
    const eventId = c.req.param('eventId')
    const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
    if (!event) throw notFound('Event not found')
    const body = await readJson(c.req.raw)
    const name = requireString(body, 'name', { max: 200 })
    const id = uuid()
    if (kind === 'rooms') {
      await run(
        c.env.DB,
        'INSERT INTO rooms (id, event_id, name, capacity, sort) VALUES (?, ?, ?, ?, ?)',
        id,
        eventId,
        name,
        typeof body.capacity === 'number' ? body.capacity : null,
        typeof body.sort === 'number' ? body.sort : 0
      )
    } else {
      await run(
        c.env.DB,
        'INSERT INTO tracks (id, event_id, name, color, sort) VALUES (?, ?, ?, ?, ?)',
        id,
        eventId,
        name,
        optionalString(body, 'color') ?? null,
        typeof body.sort === 'number' ? body.sort : 0
      )
    }
    const row = await one(c.env.DB, `SELECT * FROM ${kind} WHERE id = ?`, id)
    return c.json({ [kind.slice(0, -1)]: row }, 201)
  })
}

schedule.patch('/rooms/:id', async (c) => updateSimple(c, 'rooms', ['name', 'capacity', 'sort']))
schedule.patch('/tracks/:id', async (c) => updateSimple(c, 'tracks', ['name', 'color', 'sort']))
schedule.delete('/rooms/:id', async (c) => deleteSimple(c, 'rooms', 'room_id'))
schedule.delete('/tracks/:id', async (c) => deleteSimple(c, 'tracks', 'track_id'))

// --- schedule & slots (conflicts returned on every read/mutation) ---

schedule.get('/events/:eventId/schedule', async (c) => {
  return c.json(await schedulePayload(c.env.DB, c.req.param('eventId')))
})

schedule.post('/events/:eventId/schedule/slots', async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const body = await readJson(c.req.raw)
  const starts = requireString(body, 'starts_at')
  const ends = requireString(body, 'ends_at')
  validateTimes(starts, ends)
  const submissionId = optionalString(body, 'submission_id') ?? null
  if (submissionId) {
    const sub = await one<{ event_id: string }>(c.env.DB, 'SELECT event_id FROM submissions WHERE id = ?', submissionId)
    if (!sub || sub.event_id !== eventId) throw badRequest('submission_id does not belong to this event', 'invalid_submission')
  }
  const id = uuid()
  await run(
    c.env.DB,
    `INSERT INTO schedule_slots (id, event_id, submission_id, room_id, track_id, title, starts_at, ends_at, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    eventId,
    submissionId,
    optionalString(body, 'room_id') ?? null,
    optionalString(body, 'track_id') ?? null,
    optionalString(body, 'title') ?? null,
    starts,
    ends,
    optionalString(body, 'kind') ?? 'talk'
  )
  return c.json({ slot_id: id, ...(await schedulePayload(c.env.DB, eventId)) }, 201)
})

schedule.patch('/slots/:slotId', async (c) => {
  const id = c.req.param('slotId')
  const slot = await one<{ id: string; event_id: string; starts_at: string; ends_at: string }>(
    c.env.DB,
    'SELECT * FROM schedule_slots WHERE id = ?',
    id
  )
  if (!slot) throw notFound('Slot not found')
  const body = await readJson(c.req.raw)
  const updates: string[] = []
  const binds: unknown[] = []
  for (const f of ['submission_id', 'room_id', 'track_id', 'title', 'kind', 'starts_at', 'ends_at'] as const) {
    if (f in body) {
      updates.push(`${f} = ?`)
      binds.push(body[f] === null ? null : optionalString(body, f))
    }
  }
  const starts = (optionalString(body, 'starts_at') ?? slot.starts_at) as string
  const ends = (optionalString(body, 'ends_at') ?? slot.ends_at) as string
  validateTimes(starts, ends)
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE schedule_slots SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  return c.json(await schedulePayload(c.env.DB, slot.event_id))
})

schedule.delete('/slots/:slotId', async (c) => {
  const id = c.req.param('slotId')
  const slot = await one<{ event_id: string }>(c.env.DB, 'SELECT event_id FROM schedule_slots WHERE id = ?', id)
  if (!slot) throw notFound('Slot not found')
  await run(c.env.DB, 'DELETE FROM schedule_slots WHERE id = ?', id)
  return c.json(await schedulePayload(c.env.DB, slot.event_id))
})

// --- helpers ---

export async function schedulePayload(db: D1Database, eventId: string) {
  const slots = await all<SlotForConflicts & Record<string, unknown>>(
    db,
    `SELECT sl.*, sub.speaker_id, sub.title AS submission_title, sub.track AS submission_track,
            sp.name AS speaker_name, r.name AS room_name, t.name AS track_name, t.color AS track_color
     FROM schedule_slots sl
     LEFT JOIN submissions sub ON sub.id = sl.submission_id
     LEFT JOIN speakers sp ON sp.id = sub.speaker_id
     LEFT JOIN rooms r ON r.id = sl.room_id
     LEFT JOIN tracks t ON t.id = sl.track_id
     WHERE sl.event_id = ?
     ORDER BY sl.starts_at`,
    eventId
  )
  return { slots, conflicts: computeConflicts(slots) }
}

function validateTimes(starts: string, ends: string) {
  if (Number.isNaN(Date.parse(starts)) || Number.isNaN(Date.parse(ends))) {
    throw badRequest('starts_at/ends_at must be ISO-8601 timestamps', 'invalid_time')
  }
  if (ends <= starts) throw badRequest('ends_at must be after starts_at', 'invalid_time_range')
}

async function updateSimple(
  c: Parameters<Parameters<typeof schedule.patch>[1]>[0],
  table: 'rooms' | 'tracks',
  fields: readonly string[]
) {
  const id = c.req.param('id')
  const existing = await one(c.env.DB, `SELECT id FROM ${table} WHERE id = ?`, id)
  if (!existing) throw notFound(`${table.slice(0, -1)} not found`)
  const body = await readJson(c.req.raw)
  const updates: string[] = []
  const binds: unknown[] = []
  for (const f of fields) {
    if (f in body) {
      updates.push(`${f} = ?`)
      binds.push(body[f] === null ? null : (body[f] as unknown))
    }
  }
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one(c.env.DB, `SELECT * FROM ${table} WHERE id = ?`, id)
  return c.json({ [table.slice(0, -1)]: row })
}

async function deleteSimple(
  c: Parameters<Parameters<typeof schedule.delete>[1]>[0],
  table: 'rooms' | 'tracks',
  slotFk: 'room_id' | 'track_id'
) {
  const id = c.req.param('id')
  const existing = await one(c.env.DB, `SELECT id FROM ${table} WHERE id = ?`, id)
  if (!existing) throw notFound(`${table.slice(0, -1)} not found`)
  await run(c.env.DB, `UPDATE schedule_slots SET ${slotFk} = NULL WHERE ${slotFk} = ?`, id)
  await run(c.env.DB, `DELETE FROM ${table} WHERE id = ?`, id)
  return c.json({ ok: true })
}

export default schedule
