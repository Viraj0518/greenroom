import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { readBody, readJson, requireString, optionalString, notFound } from '../lib/http'
import { all, one, run, uuid, now } from '../lib/db'
import { requireOrganizer, requireAdmin } from '../lib/auth'

interface EventRow {
  id: string
  name: string
  slug: string
  starts_on: string | null
  ends_on: string | null
  timezone: string | null
  description: string | null
  created_at: string
}

const events = new Hono<AppEnv>()

events.get('/events', requireOrganizer, async (c) => {
  const rows = await all<EventRow>(c.env.DB, 'SELECT * FROM events ORDER BY created_at DESC')
  return c.json({ events: rows })
})

events.post('/events', requireOrganizer, async (c) => {
  const body = await readBody(c.req.raw, ['name', 'slug', 'starts_on', 'ends_on', 'timezone', 'description'])
  const name = requireString(body, 'name', { max: 300 })
  const slug = (optionalString(body, 'slug') ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const id = uuid()
  await run(
    c.env.DB,
    `INSERT INTO events (id, name, slug, starts_on, ends_on, timezone, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    slug,
    optionalString(body, 'starts_on') ?? null,
    optionalString(body, 'ends_on') ?? null,
    optionalString(body, 'timezone') ?? 'UTC',
    optionalString(body, 'description') ?? null,
    now()
  )
  const row = await one<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', id)
  return c.json(row, 201)
})

events.get('/events/:eventId', requireOrganizer, async (c) => {
  const row = await one<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', c.req.param('eventId'))
  if (!row) throw notFound('Event not found')
  return c.json(row)
})

events.patch('/events/:eventId', requireOrganizer, async (c) => {
  const id = c.req.param('eventId')
  const existing = await one<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', id)
  if (!existing) throw notFound('Event not found')
  const body = await readBody(c.req.raw, ['name', 'slug', 'starts_on', 'ends_on', 'timezone', 'description'])
  const fields = ['name', 'slug', 'starts_on', 'ends_on', 'timezone', 'description'] as const
  const updates: string[] = []
  const binds: unknown[] = []
  for (const f of fields) {
    const v = optionalString(body, f)
    if (v !== undefined) {
      updates.push(`${f} = ?`)
      binds.push(v)
    }
  }
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE events SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one<EventRow>(c.env.DB, 'SELECT * FROM events WHERE id = ?', id)
  return c.json(row)
})

events.delete('/events/:eventId', requireAdmin, async (c) => {
  const id = c.req.param('eventId')
  const existing = await one<EventRow>(c.env.DB, 'SELECT id FROM events WHERE id = ?', id)
  if (!existing) throw notFound('Event not found')
  await run(c.env.DB, 'DELETE FROM events WHERE id = ?', id)
  return c.json({ ok: true })
})

export default events
