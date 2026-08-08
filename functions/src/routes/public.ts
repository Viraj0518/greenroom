// Public, CORS-open, cacheable endpoints: embeds JSON + public resource pages.
// Data loaders are shared with the server-rendered /embed/* HTML pages (pin #6),
// so both surfaces stay on the same single-digit query budget.

import { Hono } from 'hono'
import type { AppEnv, D1Database } from '../types'
import { notFound } from '../lib/http'
import { all, one, parseJson } from '../lib/db'

const pub = new Hono<AppEnv>()

export const CACHE_60 = 'public, max-age=60'

export interface PublicEvent {
  id: string
  name: string
  slug: string
  starts_on: string | null
  ends_on: string | null
  timezone: string | null
}

export async function eventBySlug(db: D1Database, slug: string): Promise<PublicEvent> {
  const event = await one<PublicEvent>(
    db,
    'SELECT id, name, slug, starts_on, ends_on, timezone FROM events WHERE slug = ?',
    slug
  )
  if (!event) throw notFound('Event not found')
  return event
}

export interface SpeakersPayload {
  event: { name: string; slug: string }
  speakers: Array<{
    id: string
    name: string
    tagline: string | null
    company: string | null
    bio: string | null
    links: Record<string, unknown>
    headshot_url: string | null
  }>
}

// 2 queries total.
export async function loadSpeakersPayload(db: D1Database, slug: string): Promise<SpeakersPayload> {
  const event = await eventBySlug(db, slug)
  const rows = await all<{
    id: string
    name: string
    tagline: string | null
    company: string | null
    bio: string | null
    links_json: string | null
    headshot_asset_id: string | null
  }>(
    db,
    `SELECT DISTINCT sp.id, sp.name, sp.tagline, sp.company, sp.bio, sp.links_json,
            (SELECT a.id FROM assets a
             WHERE a.speaker_id = sp.id AND a.kind = 'headshot'
             ORDER BY a.created_at DESC LIMIT 1) AS headshot_asset_id
     FROM speakers sp
     JOIN submissions s ON s.speaker_id = sp.id AND s.status = 'accepted'
     WHERE sp.event_id = ?
     ORDER BY sp.name`,
    event.id
  )
  return {
    event: { name: event.name, slug: event.slug },
    speakers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      tagline: r.tagline,
      company: r.company,
      bio: r.bio,
      links: parseJson(r.links_json, {}),
      headshot_url: r.headshot_asset_id ? `/api/assets/${r.headshot_asset_id}` : null,
    })),
  }
}

export interface ScheduleSlotView {
  id: string
  title: string
  abstract: string | null
  speaker: string | null
  speaker_company: string | null
  starts_at: string
  ends_at: string
  kind: string
  room_id: string | null
  track_id: string | null
}

export interface SchedulePayload {
  event: { name: string; slug: string; timezone: string | null }
  rooms: Array<{ id: string; name: string }>
  tracks: Array<{ id: string; name: string; color: string | null }>
  days: Array<{ date: string; slots: ScheduleSlotView[] }>
}

// 4 queries total.
export async function loadSchedulePayload(db: D1Database, slug: string): Promise<SchedulePayload> {
  const event = await eventBySlug(db, slug)
  const [slots, rooms, tracks] = await Promise.all([
    all<{
      id: string
      starts_at: string
      ends_at: string
      kind: string
      slot_title: string | null
      talk_title: string | null
      abstract: string | null
      speaker_name: string | null
      speaker_company: string | null
      room_id: string | null
      track_id: string | null
    }>(
      db,
      `SELECT sl.id, sl.starts_at, sl.ends_at, sl.kind, sl.title AS slot_title, sl.room_id, sl.track_id,
              s.title AS talk_title, s.abstract, sp.name AS speaker_name, sp.company AS speaker_company
       FROM schedule_slots sl
       LEFT JOIN submissions s ON s.id = sl.submission_id AND s.status = 'accepted'
       LEFT JOIN speakers sp ON sp.id = s.speaker_id
       WHERE sl.event_id = ? AND (sl.submission_id IS NULL OR s.id IS NOT NULL)
       ORDER BY sl.starts_at`,
      event.id
    ),
    all<{ id: string; name: string }>(db, 'SELECT id, name FROM rooms WHERE event_id = ? ORDER BY sort, name', event.id),
    all<{ id: string; name: string; color: string | null }>(
      db,
      'SELECT id, name, color FROM tracks WHERE event_id = ? ORDER BY sort, name',
      event.id
    ),
  ])

  const days = new Map<string, ScheduleSlotView[]>()
  for (const slot of slots) {
    const day = slot.starts_at.slice(0, 10)
    if (!days.has(day)) days.set(day, [])
    days.get(day)!.push({
      id: slot.id,
      title: slot.slot_title ?? slot.talk_title ?? '(untitled)',
      abstract: slot.abstract,
      speaker: slot.speaker_name,
      speaker_company: slot.speaker_company,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      kind: slot.kind,
      room_id: slot.room_id,
      track_id: slot.track_id,
    })
  }

  return {
    event: { name: event.name, slug: event.slug, timezone: event.timezone },
    rooms,
    tracks,
    days: [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, daySlots]) => ({ date, slots: daySlots })),
  }
}

// --- JSON routes ---

pub.get('/public/events/:slug/speakers', async (c) => {
  const payload = await loadSpeakersPayload(c.env.DB, c.req.param('slug'))
  return c.json(payload, 200, { 'Cache-Control': CACHE_60 })
})

pub.get('/public/events/:slug/schedule', async (c) => {
  const payload = await loadSchedulePayload(c.env.DB, c.req.param('slug'))
  return c.json(payload, 200, { 'Cache-Control': CACHE_60 })
})

pub.get('/public/events/:slug/resources', async (c) => {
  const event = await eventBySlug(c.env.DB, c.req.param('slug'))
  const rows = await all(
    c.env.DB,
    'SELECT id, title, slug, sort, updated_at FROM resources WHERE event_id = ? AND is_public = 1 ORDER BY sort, title',
    event.id
  )
  return c.json({ event: { name: event.name, slug: event.slug }, resources: rows }, 200, {
    'Cache-Control': CACHE_60,
  })
})

pub.get('/public/events/:slug/resources/:rslug', async (c) => {
  const event = await eventBySlug(c.env.DB, c.req.param('slug'))
  const row = await one(
    c.env.DB,
    'SELECT id, title, slug, body_md, embed_html, updated_at FROM resources WHERE event_id = ? AND slug = ? AND is_public = 1',
    event.id,
    c.req.param('rslug')
  )
  if (!row) throw notFound('Resource not found')
  return c.json({ event: { name: event.name, slug: event.slug }, resource: row }, 200, {
    'Cache-Control': CACHE_60,
  })
})

export default pub
