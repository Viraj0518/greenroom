import { Hono } from 'hono'
import type { AppEnv, AssetKind, Speaker } from '../types'
import { ASSET_KINDS } from '../types'
import { readBody, optionalString, badRequest, notFound, notConfigured } from '../lib/http'
import { all, one, run, uuid, now, parseJson } from '../lib/db'
import { requireSpeaker } from '../lib/auth'
import { getStorage } from '../storage/provider'
import { googleCalendarLink, outlookCalendarLink } from '../lib/calendar-links'
import { icsUrl } from '../email/send'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

const portal = new Hono<AppEnv>()

portal.use('/portal/*', requireSpeaker)

portal.get('/portal/me', async (c) => {
  const speaker = c.get('speaker')!
  const [submissions, slots, tasks, assets, event] = await Promise.all([
    all<Record<string, unknown> & { id: string; title: string; abstract: string | null; status: string }>(
      c.env.DB,
      'SELECT id, title, abstract, category, track, status, created_at FROM submissions WHERE speaker_id = ? ORDER BY created_at DESC',
      speaker.id
    ),
    all<{ submission_id: string; starts_at: string; ends_at: string; slot_title: string | null; room_name: string | null }>(
      c.env.DB,
      `SELECT sl.submission_id, sl.starts_at, sl.ends_at, sl.title AS slot_title, r.name AS room_name
       FROM schedule_slots sl
       JOIN submissions s ON s.id = sl.submission_id
       LEFT JOIN rooms r ON r.id = sl.room_id
       WHERE s.speaker_id = ? AND s.status = 'accepted'
       ORDER BY sl.starts_at`,
      speaker.id
    ),
    all<Record<string, unknown>>(
      c.env.DB,
      `SELECT t.key, t.label, t.due_at, t.required, COALESCE(st.done, 0) AS done, st.done_at
       FROM onboarding_tasks t
       LEFT JOIN speaker_tasks st ON st.task_key = t.key AND st.speaker_id = ?
       WHERE t.event_id = ?
       ORDER BY t.due_at IS NULL, t.due_at`,
      speaker.id,
      speaker.event_id
    ),
    all<Record<string, unknown>>(
      c.env.DB,
      'SELECT id, kind, filename, content_type, size, created_at FROM assets WHERE speaker_id = ? ORDER BY created_at DESC',
      speaker.id
    ),
    one<Record<string, unknown>>(
      c.env.DB,
      'SELECT id, name, slug, starts_on, ends_on, timezone FROM events WHERE id = ?',
      speaker.event_id
    ),
  ])
  // "Add to calendar" support (requirement 3): earliest slot per accepted submission
  // drives per-submission Gmail/Outlook deeplinks; ics_url covers iCal for everything.
  const slotBySubmission = new Map<string, (typeof slots)[number]>()
  for (const s of slots) {
    if (!slotBySubmission.has(s.submission_id)) slotBySubmission.set(s.submission_id, s)
  }
  const withCalendar = submissions.map((sub) => {
    const slot = slotBySubmission.get(sub.id)
    if (!slot) return { ...sub, slot: null, gcal_link: null, outlook_link: null }
    const linkEvent = {
      title: slot.slot_title ?? sub.title,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      location: slot.room_name ?? undefined,
      description: sub.abstract ?? undefined,
    }
    return {
      ...sub,
      slot: { starts_at: slot.starts_at, ends_at: slot.ends_at, room: slot.room_name },
      gcal_link: googleCalendarLink(linkEvent),
      outlook_link: outlookCalendarLink(linkEvent),
    }
  })

  return c.json({
    speaker: publicSpeaker(speaker),
    event,
    submissions: withCalendar,
    tasks,
    assets,
    ics_url: icsUrl(c.env, c.req.url, speaker),
  })
})

portal.patch('/portal/me', async (c) => {
  const speaker = c.get('speaker')!
  const body = await readBody(c.req.raw, ['name', 'bio', 'tagline', 'company', 'links_json'])
  const updates: string[] = []
  const binds: unknown[] = []
  for (const f of ['name', 'bio', 'tagline', 'company'] as const) {
    const v = optionalString(body, f)
    if (v !== undefined) {
      updates.push(`${f} = ?`)
      binds.push(v)
    }
  }
  if (body.links_json !== undefined) {
    const links = typeof body.links_json === 'string' ? parseJson(body.links_json, null) : body.links_json
    if (links === null || typeof links !== 'object') throw badRequest('links_json must be JSON', 'invalid_links')
    updates.push('links_json = ?')
    binds.push(JSON.stringify(links))
  }
  if (updates.length) {
    binds.push(speaker.id)
    await run(c.env.DB, `UPDATE speakers SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  // Filling out the profile completes the matching onboarding task, if the event defines one.
  const updated = (await one<Speaker>(c.env.DB, 'SELECT * FROM speakers WHERE id = ?', speaker.id))!
  if (updated.bio && updated.tagline) {
    await completeTaskIfDefined(c.env.DB, updated, 'profile')
  }
  return c.json({ speaker: publicSpeaker(updated) })
})

// Multipart upload: fields `kind` + `file` → R2, registers asset, auto-completes matching task.
portal.post('/portal/assets', async (c) => {
  const storage = getStorage(c.env)
  if (!storage) throw notConfigured('File storage is not configured', 'storage_not_configured')
  const speaker = c.get('speaker')!
  let form: FormData
  try {
    form = await c.req.raw.formData()
  } catch {
    throw badRequest('Expected multipart/form-data with kind and file', 'invalid_multipart')
  }
  const kind = form.get('kind')
  if (typeof kind !== 'string' || !ASSET_KINDS.includes(kind as AssetKind)) {
    throw badRequest(`kind must be one of: ${ASSET_KINDS.join(', ')}`, 'invalid_kind')
  }
  const file = form.get('file')
  if (!(file instanceof File)) throw badRequest('Missing file', 'missing_file')
  if (file.size === 0) throw badRequest('File is empty', 'empty_file')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`, 'file_too_large')
  }

  const filename = (file.name || 'upload').replace(/[^\w.\-() ]+/g, '_').slice(0, 200)
  const contentType = file.type || 'application/octet-stream'
  const assetId = uuid()
  const key = `events/${speaker.event_id}/speakers/${speaker.id}/${kind}/${assetId}-${filename}`

  await storage.put(key, await file.arrayBuffer(), contentType)
  await run(
    c.env.DB,
    `INSERT INTO assets (id, event_id, speaker_id, submission_id, kind, r2_key, filename, content_type, size, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    assetId,
    speaker.event_id,
    speaker.id,
    kind,
    key,
    filename,
    contentType,
    file.size,
    now()
  )
  if (kind === 'headshot') {
    await run(c.env.DB, 'UPDATE speakers SET headshot_key = ? WHERE id = ?', key, speaker.id)
  }
  // Convention (coordinated with data): onboarding task keys match asset kinds.
  await completeTaskIfDefined(c.env.DB, speaker, kind)

  const asset = await one<Record<string, unknown>>(
    c.env.DB,
    'SELECT id, kind, filename, content_type, size, created_at FROM assets WHERE id = ?',
    assetId
  )
  return c.json({ asset }, 201)
})

portal.delete('/portal/assets/:assetId', async (c) => {
  const speaker = c.get('speaker')!
  const asset = await one<{ id: string; r2_key: string; kind: string; speaker_id: string }>(
    c.env.DB,
    'SELECT id, r2_key, kind, speaker_id FROM assets WHERE id = ? AND speaker_id = ?',
    c.req.param('assetId'),
    speaker.id
  )
  if (!asset) throw notFound('Asset not found')
  const storage = getStorage(c.env)
  if (!storage) throw notConfigured('File storage is not configured', 'storage_not_configured')
  await storage.delete(asset.r2_key)
  await run(c.env.DB, 'DELETE FROM assets WHERE id = ?', asset.id)
  if (asset.kind === 'headshot') {
    await run(
      c.env.DB,
      'UPDATE speakers SET headshot_key = NULL WHERE id = ? AND headshot_key = ?',
      speaker.id,
      asset.r2_key
    )
  }
  return c.json({ ok: true })
})

portal.post('/portal/tasks/:taskKey/done', async (c) => {
  const speaker = c.get('speaker')!
  const taskKey = c.req.param('taskKey')
  const task = await one(
    c.env.DB,
    'SELECT id FROM onboarding_tasks WHERE event_id = ? AND key = ?',
    speaker.event_id,
    taskKey
  )
  if (!task) throw notFound('Unknown task', 'unknown_task')
  await markTaskDone(c.env.DB, speaker.id, taskKey)
  return c.json({ ok: true })
})

// --- helpers ---

function publicSpeaker(s: Speaker) {
  return {
    id: s.id,
    event_id: s.event_id,
    email: s.email,
    name: s.name,
    bio: s.bio,
    tagline: s.tagline,
    company: s.company,
    headshot_key: s.headshot_key,
    links: parseJson(s.links_json, {}),
  }
}

async function markTaskDone(db: AppEnv['Bindings']['DB'], speakerId: string, taskKey: string) {
  await run(
    db,
    `INSERT INTO speaker_tasks (id, speaker_id, task_key, done, done_at) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(speaker_id, task_key) DO UPDATE SET done = 1, done_at = excluded.done_at`,
    uuid(),
    speakerId,
    taskKey,
    now()
  )
}

async function completeTaskIfDefined(db: AppEnv['Bindings']['DB'], speaker: Speaker, taskKey: string) {
  const task = await one(
    db,
    'SELECT id FROM onboarding_tasks WHERE event_id = ? AND key = ?',
    speaker.event_id,
    taskKey
  )
  if (task) await markTaskDone(db, speaker.id, taskKey)
}

export default portal
