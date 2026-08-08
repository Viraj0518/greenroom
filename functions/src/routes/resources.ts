import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { readBody, readJson, requireString, optionalString, optionalFlag, badRequest, notFound } from '../lib/http'
import { all, one, run, uuid, now } from '../lib/db'
import { requireOrganizer } from '../lib/auth'

interface ResourceRow {
  id: string
  event_id: string
  title: string
  slug: string
  body_md: string | null
  embed_html: string | null
  is_public: number
  sort: number
  updated_at: string
}

const resources = new Hono<AppEnv>()

resources.get('/events/:eventId/resources', requireOrganizer, async (c) => {
  const rows = await all<ResourceRow>(
    c.env.DB,
    'SELECT * FROM resources WHERE event_id = ? ORDER BY sort, title',
    c.req.param('eventId')
  )
  return c.json({ resources: rows })
})

resources.post('/events/:eventId/resources', requireOrganizer, async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const body = await readBody(c.req.raw, ['title', 'slug', 'body_md', 'embed_html', 'is_public', 'sort'])
  const title = requireString(body, 'title', { max: 300 })
  const slug = (optionalString(body, 'slug') ?? title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) throw badRequest('Could not derive a slug from the title', 'invalid_slug')
  const id = uuid()
  await run(
    c.env.DB,
    `INSERT INTO resources (id, event_id, title, slug, body_md, embed_html, is_public, sort, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    eventId,
    title,
    slug,
    optionalString(body, 'body_md') ?? null,
    optionalString(body, 'embed_html') ?? null,
    optionalFlag(body, 'is_public') ?? 0,
    typeof body.sort === 'number' ? body.sort : 0,
    now()
  )
  const row = await one<ResourceRow>(c.env.DB, 'SELECT * FROM resources WHERE id = ?', id)
  return c.json(row, 201)
})

resources.get('/resources/:id', requireOrganizer, async (c) => {
  const row = await one<ResourceRow>(c.env.DB, 'SELECT * FROM resources WHERE id = ?', c.req.param('id'))
  if (!row) throw notFound('Resource not found')
  return c.json(row)
})

resources.patch('/resources/:id', requireOrganizer, async (c) => {
  const id = c.req.param('id')
  const existing = await one<ResourceRow>(c.env.DB, 'SELECT * FROM resources WHERE id = ?', id)
  if (!existing) throw notFound('Resource not found')
  const body = await readBody(c.req.raw, ['title', 'slug', 'body_md', 'embed_html', 'is_public', 'sort'])
  const updates: string[] = []
  const binds: unknown[] = []
  for (const f of ['title', 'slug', 'body_md', 'embed_html'] as const) {
    if (f in body) {
      updates.push(`${f} = ?`)
      binds.push(body[f] === null ? null : optionalString(body, f))
    }
  }
  const isPublic = optionalFlag(body, 'is_public')
  if (isPublic !== undefined) {
    updates.push('is_public = ?')
    binds.push(isPublic)
  }
  if (typeof body.sort === 'number') {
    updates.push('sort = ?')
    binds.push(body.sort)
  }
  if (updates.length) {
    updates.push('updated_at = ?')
    binds.push(now(), id)
    await run(c.env.DB, `UPDATE resources SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one<ResourceRow>(c.env.DB, 'SELECT * FROM resources WHERE id = ?', id)
  return c.json(row)
})

resources.delete('/resources/:id', requireOrganizer, async (c) => {
  const id = c.req.param('id')
  const existing = await one(c.env.DB, 'SELECT id FROM resources WHERE id = ?', id)
  if (!existing) throw notFound('Resource not found')
  await run(c.env.DB, 'DELETE FROM resources WHERE id = ?', id)
  return c.json({ ok: true })
})

export default resources
