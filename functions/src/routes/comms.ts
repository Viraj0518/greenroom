import { Hono } from 'hono'
import type { AppEnv, D1Database, Speaker } from '../types'
import { readBody, requireString, optionalString, badRequest, notFound, unauthorized } from '../lib/http'
import { all, one, run, uuid, now } from '../lib/db'
import { requireOrganizer } from '../lib/auth'
import { buildCalendar, type IcsEvent } from '../lib/ics'
import { portalUrl, icsUrl } from '../email/send'
import { getEmailProvider } from '../email/provider'
import { renderMarkdown, renderVars } from '../lib/markdown'
import { googleCalendarLink, outlookCalendarLink } from '../lib/calendar-links'

const comms = new Hono<AppEnv>()

comms.use('/events/:eventId/templates', requireOrganizer)
comms.use('/events/:eventId/send', requireOrganizer)
comms.use('/events/:eventId/emails', requireOrganizer)
comms.use('/templates/*', requireOrganizer)

// --- templates ---

comms.get('/events/:eventId/templates', async (c) => {
  const rows = await all(
    c.env.DB,
    'SELECT * FROM email_templates WHERE event_id = ? ORDER BY key',
    c.req.param('eventId')
  )
  return c.json({ templates: rows })
})

comms.post('/events/:eventId/templates', async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const body = await readBody(c.req.raw, ['key', 'name', 'subject', 'body_md'])
  const key = requireString(body, 'key', { max: 100 })
  if (!/^[a-z0-9_-]+$/.test(key)) throw badRequest('key must be lowercase slug characters', 'invalid_key')
  const dup = await one(c.env.DB, 'SELECT id FROM email_templates WHERE event_id = ? AND key = ?', eventId, key)
  if (dup) throw badRequest(`Template key already exists: ${key}`, 'key_taken')
  const id = uuid()
  await run(
    c.env.DB,
    'INSERT INTO email_templates (id, event_id, key, name, subject, body_md) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    eventId,
    key,
    requireString(body, 'name', { max: 200 }),
    requireString(body, 'subject', { max: 500 }),
    requireString(body, 'body_md', { max: 50000 })
  )
  const row = await one(c.env.DB, 'SELECT * FROM email_templates WHERE id = ?', id)
  return c.json(row, 201)
})

comms.patch('/templates/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await one(c.env.DB, 'SELECT id FROM email_templates WHERE id = ?', id)
  if (!existing) throw notFound('Template not found')
  const body = await readBody(c.req.raw, ['name', 'subject', 'body_md'])
  const updates: string[] = []
  const binds: unknown[] = []
  for (const f of ['name', 'subject', 'body_md'] as const) {
    const v = optionalString(body, f)
    if (v !== undefined) {
      updates.push(`${f} = ?`)
      binds.push(v)
    }
  }
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one(c.env.DB, 'SELECT * FROM email_templates WHERE id = ?', id)
  return c.json(row)
})

comms.delete('/templates/:id', async (c) => {
  const id = c.req.param('id')
  const existing = await one(c.env.DB, 'SELECT id FROM email_templates WHERE id = ?', id)
  if (!existing) throw notFound('Template not found')
  await run(c.env.DB, 'DELETE FROM email_templates WHERE id = ?', id)
  return c.json({ ok: true })
})

// --- batch send ---
// {template_key, speaker_ids?: string[], filter?: {status?: string}, include_ics?: boolean}

comms.post('/events/:eventId/send', async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one<{ id: string; name: string }>(c.env.DB, 'SELECT id, name FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const raw = await readBody(c.req.raw, ['template_key', 'speaker_ids', 'filter', 'include_ics'])
  if (raw.filter !== undefined) {
    if (raw.filter === null || typeof raw.filter !== 'object' || Array.isArray(raw.filter)) {
      throw badRequest('filter must be an object', 'invalid_body')
    }
    const unknown = Object.keys(raw.filter).filter((k) => k !== 'status')
    if (unknown.length) throw badRequest(`Unknown filter keys: ${unknown.join(', ')}`, 'invalid_body')
  }
  const body = raw as { template_key?: unknown; speaker_ids?: unknown; filter?: { status?: string }; include_ics?: unknown }
  const templateKey = typeof body.template_key === 'string' ? body.template_key : ''
  if (!templateKey) throw badRequest('Missing template_key', 'missing_field')
  const template = await one<{ subject: string; body_md: string }>(
    c.env.DB,
    'SELECT subject, body_md FROM email_templates WHERE event_id = ? AND key = ?',
    eventId,
    templateKey
  )
  if (!template) throw notFound(`No template with key: ${templateKey}`, 'unknown_template')

  let speakers: Speaker[]
  if (Array.isArray(body.speaker_ids) && body.speaker_ids.length) {
    const ids = body.speaker_ids.filter((v): v is string => typeof v === 'string')
    const placeholders = ids.map(() => '?').join(',')
    speakers = await all<Speaker>(
      c.env.DB,
      `SELECT * FROM speakers WHERE event_id = ? AND id IN (${placeholders})`,
      eventId,
      ...ids
    )
  } else if (body.filter?.status) {
    speakers = await all<Speaker>(
      c.env.DB,
      `SELECT DISTINCT sp.* FROM speakers sp
       JOIN submissions s ON s.speaker_id = sp.id
       WHERE sp.event_id = ? AND s.status = ?`,
      eventId,
      body.filter.status
    )
  } else {
    speakers = await all<Speaker>(c.env.DB, 'SELECT * FROM speakers WHERE event_id = ?', eventId)
  }

  // Pin #6: batch the per-speaker reads (1 IN-query each) and the log writes (1 db.batch)
  // instead of looping queries — the loop below only does the unavoidable network sends.
  const speakerIds = speakers.map((s) => s.id)
  const inPlaceholders = speakerIds.map(() => '?').join(',')

  const talksBySpeaker = new Map<string, string[]>()
  if (speakerIds.length) {
    const talkRows = await all<{ speaker_id: string; title: string }>(
      c.env.DB,
      `SELECT speaker_id, title FROM submissions WHERE status = 'accepted' AND speaker_id IN (${inPlaceholders})`,
      ...speakerIds
    )
    for (const t of talkRows) {
      if (!talksBySpeaker.has(t.speaker_id)) talksBySpeaker.set(t.speaker_id, [])
      talksBySpeaker.get(t.speaker_id)!.push(t.title)
    }
  }

  // Fetched regardless of include_ics: the primary slot also feeds the
  // {{gcal_link}}/{{outlook_link}} template variables (requirement 3: Gmail/Outlook/iCal).
  const icsRowsBySpeaker = new Map<string, IcsRow[]>()
  if (speakerIds.length) {
    const icsRows = await all<IcsRow & { speaker_id: string }>(
      c.env.DB,
      `SELECT s.speaker_id, sl.id, sl.starts_at, sl.ends_at, sl.title AS slot_title, s.title AS talk_title,
              s.abstract, r.name AS room_name
       FROM schedule_slots sl
       JOIN submissions s ON s.id = sl.submission_id
       LEFT JOIN rooms r ON r.id = sl.room_id
       WHERE s.status = 'accepted' AND s.speaker_id IN (${inPlaceholders})
       ORDER BY sl.starts_at`,
      ...speakerIds
    )
    for (const r of icsRows) {
      if (!icsRowsBySpeaker.has(r.speaker_id)) icsRowsBySpeaker.set(r.speaker_id, [])
      icsRowsBySpeaker.get(r.speaker_id)!.push(r)
    }
  }

  const provider = getEmailProvider(c.env)
  const sentAt = now()
  let sent = 0
  let failed = 0
  const errors: string[] = []
  const logRows: Array<[string, string, string, string, string, string, string, string]> = []

  for (const speaker of speakers) {
    const talks = talksBySpeaker.get(speaker.id) ?? []
    // Primary slot (earliest scheduled accepted talk) drives the add-to-calendar links.
    const primary = icsRowsBySpeaker.get(speaker.id)?.[0]
    const linkEvent = primary
      ? {
          title: primary.slot_title ?? primary.talk_title,
          starts_at: primary.starts_at,
          ends_at: primary.ends_at,
          location: primary.room_name ?? undefined,
          description: primary.abstract ?? undefined,
        }
      : null
    const icsLink = icsUrl(c.env, c.req.url, speaker)
    const subject = renderVars(template.subject, { name: speaker.name, event: event.name })
    const bodyMd = renderVars(template.body_md, {
      name: speaker.name,
      email: speaker.email,
      event: event.name,
      title: talks[0],
      titles: talks.join(', '),
      portal_url: portalUrl(c.env, c.req.url, speaker),
      ics_url: icsLink,
      ics_link: icsLink,
      gcal_link: linkEvent ? googleCalendarLink(linkEvent) : '',
      outlook_link: linkEvent ? outlookCalendarLink(linkEvent) : '',
    })
    const attachments = body.include_ics
      ? [
          {
            filename: 'greenroom-schedule.ics',
            content_b64: b64Utf8(buildCalendar(event.name, icsRowsToEvents(icsRowsBySpeaker.get(speaker.id) ?? []), sentAt)),
            content_type: 'text/calendar',
          },
        ]
      : undefined

    const result = await provider.send({ to: speaker.email, subject, html: renderMarkdown(bodyMd), text: bodyMd, attachments })
    if (result.ok) sent++
    else {
      failed++
      if (result.error) errors.push(`${speaker.email}: ${result.error}`)
    }
    logRows.push([
      uuid(),
      eventId,
      speaker.id,
      templateKey,
      subject,
      result.ok ? 'sent' : `failed: ${result.error ?? 'unknown'}`.slice(0, 300),
      result.provider,
      sentAt,
    ])
  }

  if (logRows.length) {
    await c.env.DB.batch(
      logRows.map((row) =>
        c.env.DB
          .prepare(
            'INSERT INTO emails_log (id, event_id, speaker_id, template_key, subject, status, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(...row)
      )
    )
  }
  return c.json({ requested: speakers.length, sent, failed, errors: errors.slice(0, 10) })
})

comms.get('/events/:eventId/emails', async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT l.*, sp.name AS speaker_name, sp.email AS speaker_email
     FROM emails_log l LEFT JOIN speakers sp ON sp.id = l.speaker_id
     WHERE l.event_id = ? ORDER BY l.created_at DESC LIMIT 500`,
    c.req.param('eventId')
  )
  return c.json({ emails: rows })
})

// --- public ICS: the speaker's accepted + scheduled talks as VEVENTs ---

comms.get('/public/ics/:speakerFile', async (c) => {
  const speakerId = c.req.param('speakerFile').replace(/\.ics$/, '')
  const token = c.req.query('token')
  if (!token) throw unauthorized('Missing token', 'speaker_token_required')
  const speaker = await one<Speaker>(c.env.DB, 'SELECT * FROM speakers WHERE id = ?', speakerId)
  if (!speaker || speaker.magic_token !== token) throw unauthorized('Invalid token', 'invalid_speaker_token')
  const event = await one<{ name: string }>(c.env.DB, 'SELECT name FROM events WHERE id = ?', speaker.event_id)
  const ics = await speakerIcsText(c.env.DB, speaker, event?.name ?? 'GreenRoom')
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${speakerId}.ics"`,
      'Access-Control-Allow-Origin': '*',
    },
  })
})

// btoa() alone rejects non-Latin1; encode UTF-8 bytes first.
function b64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

interface IcsRow {
  id: string
  starts_at: string
  ends_at: string
  slot_title: string | null
  talk_title: string
  room_name: string | null
  abstract: string | null
}

function icsRowsToEvents(rows: IcsRow[]): IcsEvent[] {
  return rows.map((r) => ({
    uid: `${r.id}@greenroom`,
    title: r.slot_title ?? r.talk_title,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    location: r.room_name ?? undefined,
    description: r.abstract ?? undefined,
  }))
}

async function speakerIcsText(db: D1Database, speaker: Speaker, calendarName: string): Promise<string> {
  const rows = await all<IcsRow>(
    db,
    `SELECT sl.id, sl.starts_at, sl.ends_at, sl.title AS slot_title, s.title AS talk_title,
            s.abstract, r.name AS room_name
     FROM schedule_slots sl
     JOIN submissions s ON s.id = sl.submission_id
     LEFT JOIN rooms r ON r.id = sl.room_id
     WHERE s.speaker_id = ? AND s.status = 'accepted'
     ORDER BY sl.starts_at`,
    speaker.id
  )
  return buildCalendar(calendarName, icsRowsToEvents(rows), now())
}

export default comms
