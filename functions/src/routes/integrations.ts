import { Hono } from 'hono'
import type { AppEnv, D1Database } from '../types'
import { readBody, badRequest, notFound } from '../lib/http'
import { all, one, run, uuid, now, parseJson } from '../lib/db'
import { requireOrganizer } from '../lib/auth'

const KINDS = ['accelevents', 'airtable'] as const
type Kind = (typeof KINDS)[number]

// Canonical config schema per kind (pin #5): config is validated by STRUCTURE, not by
// probing key names. Unknown keys are 400 — never stored — so a secret can't be smuggled
// into config_json under a key the masker doesn't inspect. Secrets are write-only.
const CONFIG_SCHEMA: Record<Kind, Record<string, 'secret' | 'plain'>> = {
  accelevents: { apiKey: 'secret', eventId: 'plain', baseUrl: 'plain' },
  airtable: { apiKey: 'secret', baseId: 'plain' },
}

const integrations = new Hono<AppEnv>()

integrations.use('/events/:eventId/integrations/*', requireOrganizer)

integrations.get('/events/:eventId/integrations/:kind', async (c) => {
  const { eventId, kind } = params(c.req.param())
  const row = await one<{ id: string; config_json: string; last_synced_at: string | null; last_status: string | null }>(
    c.env.DB,
    'SELECT * FROM integrations WHERE event_id = ? AND kind = ?',
    eventId,
    kind
  )
  const config = sanitizeStored(kind, parseJson<Record<string, unknown>>(row?.config_json ?? null, {}))
  return c.json({
    kind,
    configured: hasSecret(kind, config),
    config: maskSecrets(kind, config),
    last_synced_at: row?.last_synced_at ?? null,
    last_status: row?.last_status ?? null,
  })
})

// Body is {config: {...}} with only canonical keys for the kind; unknown keys are 400.
// Secrets are write-only: omitting (or sending ''/null for) a secret keeps the stored value.
integrations.put('/events/:eventId/integrations/:kind', async (c) => {
  const { eventId, kind } = params(c.req.param())
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const body = await readBody(c.req.raw, ['config'])
  const incoming = body.config
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    throw badRequest('config must be an object', 'invalid_body')
  }
  const schema = CONFIG_SCHEMA[kind]
  const unknown = Object.keys(incoming).filter((k) => !(k in schema))
  if (unknown.length) {
    throw badRequest(
      `Unknown config keys for ${kind}: ${unknown.join(', ')} (allowed: ${Object.keys(schema).join(', ')})`,
      'invalid_body'
    )
  }

  const existing = await one<{ id: string; config_json: string }>(
    c.env.DB,
    'SELECT id, config_json FROM integrations WHERE event_id = ? AND kind = ?',
    eventId,
    kind
  )
  // sanitizeStored also retro-drops any non-canonical keys stored before this validation existed.
  const merged = sanitizeStored(kind, parseJson<Record<string, unknown>>(existing?.config_json ?? null, {}))
  for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
    if (v === '' || v === undefined || v === null) {
      if (schema[k] === 'secret') continue // keep stored secret
      delete merged[k]
      continue
    }
    if (typeof v !== 'string') throw badRequest(`config.${k} must be a string`, 'invalid_body')
    merged[k] = v
  }

  if (existing) {
    await run(c.env.DB, 'UPDATE integrations SET config_json = ? WHERE id = ?', JSON.stringify(merged), existing.id)
  } else {
    await run(
      c.env.DB,
      'INSERT INTO integrations (id, event_id, kind, config_json, last_synced_at, last_status) VALUES (?, ?, ?, ?, NULL, NULL)',
      uuid(),
      eventId,
      kind,
      JSON.stringify(merged)
    )
  }
  return c.json({
    kind,
    configured: hasSecret(kind, merged),
    config: maskSecrets(kind, merged),
  })
})

// One-way push. Graceful no-op summary when no API key is configured.
integrations.post('/events/:eventId/integrations/:kind/sync', async (c) => {
  const { eventId, kind } = params(c.req.param())
  const event = await one<{ id: string; name: string; slug: string }>(
    c.env.DB,
    'SELECT id, name, slug FROM events WHERE id = ?',
    eventId
  )
  if (!event) throw notFound('Event not found')
  const row = await one<{ id: string; config_json: string }>(
    c.env.DB,
    'SELECT id, config_json FROM integrations WHERE event_id = ? AND kind = ?',
    eventId,
    kind
  )
  const config = sanitizeStored(kind, parseJson<Record<string, unknown>>(row?.config_json ?? null, {}))
  const apiKey = typeof config.apiKey === 'string' && config.apiKey !== '' ? config.apiKey : null

  let summary: Record<string, unknown>
  if (!apiKey) {
    summary = { ok: true, skipped: true, reason: 'not configured: no API key set', pushed: 0 }
  } else {
    try {
      summary =
        kind === 'airtable'
          ? await syncAirtable(c.env.DB, event, config, apiKey)
          : await syncAccelevents(c.env.DB, event, config, apiKey)
    } catch (err) {
      summary = { ok: false, error: String(err).slice(0, 500) }
    }
  }

  const status = summary.ok ? (summary.skipped ? 'skipped: not configured' : 'ok') : `error: ${summary.error}`
  if (row) {
    await run(
      c.env.DB,
      'UPDATE integrations SET last_synced_at = ?, last_status = ? WHERE id = ?',
      now(),
      String(status).slice(0, 300),
      row.id
    )
  } else {
    await run(
      c.env.DB,
      'INSERT INTO integrations (id, event_id, kind, config_json, last_synced_at, last_status) VALUES (?, ?, ?, ?, ?, ?)',
      uuid(),
      eventId,
      kind,
      JSON.stringify(config),
      now(),
      String(status).slice(0, 300)
    )
  }
  return c.json(summary)
})

// --- adapters ---

async function gatherPushData(db: D1Database, eventId: string) {
  const speakers = await all<Record<string, unknown>>(
    db,
    `SELECT DISTINCT sp.id, sp.name, sp.email, sp.bio, sp.tagline, sp.company
     FROM speakers sp JOIN submissions s ON s.speaker_id = sp.id AND s.status = 'accepted'
     WHERE sp.event_id = ?`,
    eventId
  )
  const sessions = await all<Record<string, unknown>>(
    db,
    `SELECT sl.id, COALESCE(sl.title, s.title) AS title, sl.starts_at, sl.ends_at, sl.kind,
            r.name AS room, t.name AS track, sp.name AS speaker_name, s.abstract
     FROM schedule_slots sl
     LEFT JOIN submissions s ON s.id = sl.submission_id
     LEFT JOIN speakers sp ON sp.id = s.speaker_id
     LEFT JOIN rooms r ON r.id = sl.room_id
     LEFT JOIN tracks t ON t.id = sl.track_id
     WHERE sl.event_id = ?`,
    eventId
  )
  return { speakers, sessions }
}

async function syncAccelevents(
  db: D1Database,
  event: { id: string; name: string },
  config: Record<string, unknown>,
  apiKey: string
) {
  const { speakers, sessions } = await gatherPushData(db, event.id)
  const base = typeof config.baseUrl === 'string' && config.baseUrl ? config.baseUrl : 'https://api.accelevents.com'
  const accelEventId = typeof config.eventId === 'string' ? config.eventId : ''
  if (!accelEventId) {
    return { ok: true, skipped: true, reason: 'not configured: missing Accelevents eventId', pushed: 0 }
  }
  let pushed = 0
  const errors: string[] = []
  for (const [path, items] of [
    [`/rest/events/${accelEventId}/speakers/bulk`, speakers],
    [`/rest/events/${accelEventId}/sessions/bulk`, sessions],
  ] as const) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ source: 'greenroom', items }),
      })
      if (res.ok) pushed += items.length
      else errors.push(`${path}: HTTP ${res.status}`)
    } catch (err) {
      errors.push(`${path}: ${String(err).slice(0, 200)}`)
    }
  }
  return errors.length
    ? { ok: false, error: errors.join('; '), pushed }
    : { ok: true, pushed, speakers: speakers.length, sessions: sessions.length }
}

async function syncAirtable(
  db: D1Database,
  event: { id: string; name: string },
  config: Record<string, unknown>,
  apiKey: string
) {
  const baseId = typeof config.baseId === 'string' ? config.baseId : ''
  if (!baseId) return { ok: true, skipped: true, reason: 'not configured: missing Airtable baseId', pushed: 0 }
  const { speakers, sessions } = await gatherPushData(db, event.id)

  let pushed = 0
  const errors: string[] = []
  const upsert = async (table: string, records: Array<{ fields: Record<string, unknown> }>) => {
    for (let i = 0; i < records.length; i += 10) {
      const chunk = records.slice(i, i + 10)
      const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performUpsert: { fieldsToMergeOn: ['External ID'] },
          records: chunk,
          typecast: true,
        }),
      })
      if (res.ok) pushed += chunk.length
      else errors.push(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`)
    }
  }

  await upsert(
    'Speakers',
    speakers.map((s) => ({
      fields: {
        'External ID': s.id,
        Name: s.name,
        Email: s.email,
        Company: s.company ?? '',
        Tagline: s.tagline ?? '',
        Bio: s.bio ?? '',
      },
    }))
  )
  await upsert(
    'Schedule',
    sessions.map((s) => ({
      fields: {
        'External ID': s.id,
        Title: s.title ?? '',
        Starts: s.starts_at,
        Ends: s.ends_at,
        Room: s.room ?? '',
        Track: s.track ?? '',
        Speaker: s.speaker_name ?? '',
        Kind: s.kind ?? 'talk',
      },
    }))
  )
  return errors.length
    ? { ok: false, error: errors.join('; '), pushed }
    : { ok: true, pushed, speakers: speakers.length, sessions: sessions.length }
}

// --- helpers ---

function params(p: Record<string, string>): { eventId: string; kind: Kind } {
  const kind = p.kind as Kind
  if (!KINDS.includes(kind)) throw badRequest(`Unknown integration kind: ${p.kind}`, 'unknown_integration')
  return { eventId: p.eventId, kind }
}

/** Keep only canonical string-valued keys for the kind; drops anything smuggled in. */
function sanitizeStored(kind: Kind, config: Record<string, unknown>): Record<string, string> {
  const schema = CONFIG_SCHEMA[kind]
  const out: Record<string, string> = {}
  for (const k of Object.keys(schema)) {
    const v = config[k]
    if (typeof v === 'string' && v !== '') out[k] = v
  }
  return out
}

/** Structural masking: emit only canonical keys; secret values are never echoed, only a presence marker. */
function maskSecrets(kind: Kind, config: Record<string, string>): Record<string, string | undefined> {
  const schema = CONFIG_SCHEMA[kind]
  const out: Record<string, string | undefined> = {}
  for (const [k, mode] of Object.entries(schema)) {
    out[k] = mode === 'secret' ? (config[k] ? '__set__' : undefined) : config[k]
  }
  return out
}

function hasSecret(kind: Kind, config: Record<string, string>): boolean {
  return Object.entries(CONFIG_SCHEMA[kind]).some(([k, mode]) => mode === 'secret' && !!config[k])
}

export default integrations
