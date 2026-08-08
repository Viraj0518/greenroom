import { Hono } from 'hono'
import type { AppEnv, Speaker } from '../types'
import { readJson, requireString, optionalString, badRequest, notFound, forbidden } from '../lib/http'
import { all, one, run, uuid, now, parseJson } from '../lib/db'
import { requireOrganizer } from '../lib/auth'
import { randomToken } from '../lib/crypto'
import { sendSpeakerEmail, portalUrl } from '../email/send'

interface FormRow {
  id: string
  event_id: string
  name: string
  is_open: number
  opens_at: string | null
  closes_at: string | null
  spec_json: string
  created_at: string
}

interface FormSpecField {
  id: string
  type: string
  label: string
  required?: boolean
  options?: string[]
  showIf?: { fieldId: string; op: 'eq' | 'neq' | 'in'; value: unknown }
}

interface FormSpec {
  fields: FormSpecField[]
  routing?: Array<{ whenCategory: string; assignTrack: string }>
}

const forms = new Hono<AppEnv>()

// --- organizer CRUD ---

forms.get('/events/:eventId/forms', requireOrganizer, async (c) => {
  const rows = await all<FormRow>(
    c.env.DB,
    'SELECT * FROM forms WHERE event_id = ? ORDER BY created_at',
    c.req.param('eventId')
  )
  return c.json({ forms: rows.map(withSpec) })
})

forms.post('/events/:eventId/forms', requireOrganizer, async (c) => {
  const eventId = c.req.param('eventId')
  const event = await one(c.env.DB, 'SELECT id FROM events WHERE id = ?', eventId)
  if (!event) throw notFound('Event not found')
  const body = await readJson(c.req.raw)
  const name = requireString(body, 'name', { max: 300 })
  const spec = normalizeSpec(body.spec)
  const id = uuid()
  await run(
    c.env.DB,
    `INSERT INTO forms (id, event_id, name, is_open, opens_at, closes_at, spec_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    eventId,
    name,
    body.is_open === false ? 0 : 1,
    optionalString(body, 'opens_at') ?? null,
    optionalString(body, 'closes_at') ?? null,
    JSON.stringify(spec),
    now()
  )
  const row = await one<FormRow>(c.env.DB, 'SELECT * FROM forms WHERE id = ?', id)
  return c.json({ form: withSpec(row!) }, 201)
})

forms.get('/forms/:formId', requireOrganizer, async (c) => {
  const row = await one<FormRow>(c.env.DB, 'SELECT * FROM forms WHERE id = ?', c.req.param('formId'))
  if (!row) throw notFound('Form not found')
  return c.json({ form: withSpec(row) })
})

forms.patch('/forms/:formId', requireOrganizer, async (c) => {
  const id = c.req.param('formId')
  const existing = await one<FormRow>(c.env.DB, 'SELECT * FROM forms WHERE id = ?', id)
  if (!existing) throw notFound('Form not found')
  const body = await readJson(c.req.raw)
  const updates: string[] = []
  const binds: unknown[] = []
  const name = optionalString(body, 'name')
  if (name !== undefined) {
    updates.push('name = ?')
    binds.push(name)
  }
  if (typeof body.is_open === 'boolean') {
    updates.push('is_open = ?')
    binds.push(body.is_open ? 1 : 0)
  }
  for (const f of ['opens_at', 'closes_at'] as const) {
    if (f in body) {
      updates.push(`${f} = ?`)
      binds.push(body[f] === null ? null : optionalString(body, f))
    }
  }
  if (body.spec !== undefined) {
    updates.push('spec_json = ?')
    binds.push(JSON.stringify(normalizeSpec(body.spec)))
  }
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE forms SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one<FormRow>(c.env.DB, 'SELECT * FROM forms WHERE id = ?', id)
  return c.json({ form: withSpec(row!) })
})

// --- public form spec + submit ---

forms.get('/public/forms/:formId', async (c) => {
  const row = await one<FormRow>(c.env.DB, 'SELECT * FROM forms WHERE id = ?', c.req.param('formId'))
  if (!row) throw notFound('Form not found')
  const event = await one<{ id: string; name: string; slug: string }>(
    c.env.DB,
    'SELECT id, name, slug FROM events WHERE id = ?',
    row.event_id
  )
  return c.json({
    form: { ...withSpec(row), open: isOpen(row) },
    event,
  })
})

forms.post('/public/forms/:formId/submit', async (c) => {
  const form = await one<FormRow>(c.env.DB, 'SELECT * FROM forms WHERE id = ?', c.req.param('formId'))
  if (!form) throw notFound('Form not found')
  if (!isOpen(form)) throw forbidden('This form is not accepting submissions', 'form_closed')

  const body = await readJson<{ speaker?: Record<string, unknown>; answers?: Record<string, unknown> }>(c.req.raw)
  const speakerIn = body.speaker
  if (!speakerIn || typeof speakerIn !== 'object') throw badRequest('Missing speaker', 'missing_field')
  const email = requireString(speakerIn, 'email', { max: 200 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Invalid email address', 'invalid_email')
  const name = requireString(speakerIn, 'name', { max: 200 })
  const bio = optionalString(speakerIn, 'bio')
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}

  const spec = parseJson<FormSpec>(form.spec_json, { fields: [] })
  validateAnswers(spec, answers)

  const title = str(answers.title) ?? '(untitled)'
  const abstract = str(answers.abstract) ?? null
  const category = str(answers.category) ?? null
  const track =
    (category && spec.routing?.find((r) => r.whenCategory === category)?.assignTrack) ?? null

  // Upsert speaker on (event_id, email); keep the existing magic token if present.
  let speaker = await one<Speaker>(
    c.env.DB,
    'SELECT * FROM speakers WHERE event_id = ? AND email = ?',
    form.event_id,
    email
  )
  if (speaker) {
    await run(
      c.env.DB,
      'UPDATE speakers SET name = ?, bio = COALESCE(?, bio) WHERE id = ?',
      name,
      bio ?? null,
      speaker.id
    )
    speaker = { ...speaker, name, bio: bio ?? speaker.bio }
  } else {
    const id = uuid()
    const magic = randomToken(24)
    await run(
      c.env.DB,
      `INSERT INTO speakers (id, event_id, email, name, bio, magic_token, onboarding_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', ?)`,
      id,
      form.event_id,
      email,
      name,
      bio ?? null,
      magic,
      now()
    )
    speaker = (await one<Speaker>(c.env.DB, 'SELECT * FROM speakers WHERE id = ?', id))!
  }

  const submissionId = uuid()
  await run(
    c.env.DB,
    `INSERT INTO submissions (id, event_id, form_id, speaker_id, title, abstract, category, track, answers_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`,
    submissionId,
    form.event_id,
    form.id,
    speaker.id,
    title,
    abstract,
    category,
    track,
    JSON.stringify(answers),
    now()
  )

  // Confirmation email with the portal magic link. Uses the event's
  // 'cfp_confirmation' template if defined, else a built-in default.
  const event = await one<{ name: string }>(c.env.DB, 'SELECT name FROM events WHERE id = ?', form.event_id)
  const template = await one<{ subject: string; body_md: string }>(
    c.env.DB,
    "SELECT subject, body_md FROM email_templates WHERE event_id = ? AND key = 'cfp_confirmation'",
    form.event_id
  )
  const portal = portalUrl(c.env, c.req.url, speaker)
  await sendSpeakerEmail({
    env: c.env,
    eventId: form.event_id,
    speaker,
    templateKey: 'cfp_confirmation',
    subject: template?.subject ?? 'We received your talk submission — {{event}}',
    bodyMd:
      template?.body_md ??
      [
        'Hi {{name}},',
        '',
        'Thanks for submitting **{{title}}** to {{event}}. Our reviewers will take a look soon.',
        '',
        'You can update your speaker profile, upload your headshot and slides, and track your submission in your personal portal:',
        '',
        '[Open your speaker portal]({{portal_url}})',
        '',
        'Keep this link private — it signs you in without a password.',
      ].join('\n'),
    vars: {
      name: speaker.name,
      email: speaker.email,
      event: event?.name,
      title,
      portal_url: portal,
    },
  })

  return c.json({ ok: true, submission_id: submissionId }, 201)
})

// --- organizer submissions ---

forms.get('/events/:eventId/submissions', requireOrganizer, async (c) => {
  const eventId = c.req.param('eventId')
  const { status, track, q } = c.req.query()
  let sql = `SELECT s.*, sp.name AS speaker_name, sp.email AS speaker_email
             FROM submissions s JOIN speakers sp ON sp.id = s.speaker_id
             WHERE s.event_id = ?`
  const binds: unknown[] = [eventId]
  if (status) {
    sql += ' AND s.status = ?'
    binds.push(status)
  }
  if (track) {
    sql += ' AND s.track = ?'
    binds.push(track)
  }
  if (q) {
    sql += ' AND (s.title LIKE ? OR s.abstract LIKE ? OR sp.name LIKE ? OR sp.email LIKE ?)'
    const like = `%${q}%`
    binds.push(like, like, like, like)
  }
  sql += ' ORDER BY s.created_at DESC'
  const rows = await all<Record<string, unknown>>(c.env.DB, sql, ...binds)
  return c.json({
    submissions: rows.map((r) => ({ ...r, answers: parseJson(r.answers_json as string, {}) })),
  })
})

forms.patch('/submissions/:id', requireOrganizer, async (c) => {
  const id = c.req.param('id')
  const existing = await one<{ id: string }>(c.env.DB, 'SELECT id FROM submissions WHERE id = ?', id)
  if (!existing) throw notFound('Submission not found')
  const body = await readJson(c.req.raw)
  const updates: string[] = []
  const binds: unknown[] = []
  const status = optionalString(body, 'status')
  if (status !== undefined) {
    const valid = ['submitted', 'in_review', 'accepted', 'rejected', 'waitlisted', 'withdrawn']
    if (!valid.includes(status)) throw badRequest(`Invalid status: ${status}`, 'invalid_status')
    updates.push('status = ?')
    binds.push(status)
  }
  for (const f of ['track', 'category'] as const) {
    if (f in body) {
      updates.push(`${f} = ?`)
      binds.push(body[f] === null ? null : optionalString(body, f))
    }
  }
  if (updates.length) {
    binds.push(id)
    await run(c.env.DB, `UPDATE submissions SET ${updates.join(', ')} WHERE id = ?`, ...binds)
  }
  const row = await one<Record<string, unknown>>(c.env.DB, 'SELECT * FROM submissions WHERE id = ?', id)
  return c.json({ submission: row })
})

// --- helpers ---

function withSpec(row: FormRow) {
  return { ...row, spec: parseJson<FormSpec>(row.spec_json, { fields: [] }), spec_json: undefined }
}

function isOpen(form: FormRow): boolean {
  if (!form.is_open) return false
  const t = now()
  if (form.opens_at && t < form.opens_at) return false
  if (form.closes_at && t > form.closes_at) return false
  return true
}

function normalizeSpec(raw: unknown): FormSpec {
  if (!raw || typeof raw !== 'object') return { fields: [] }
  const spec = raw as FormSpec
  if (!Array.isArray(spec.fields)) throw badRequest('spec.fields must be an array', 'invalid_spec')
  return { fields: spec.fields, routing: Array.isArray(spec.routing) ? spec.routing : [] }
}

function fieldVisible(field: FormSpecField, answers: Record<string, unknown>): boolean {
  if (!field.showIf) return true
  const actual = answers[field.showIf.fieldId]
  switch (field.showIf.op) {
    case 'eq':
      return actual === field.showIf.value
    case 'neq':
      return actual !== field.showIf.value
    case 'in':
      return Array.isArray(field.showIf.value) && field.showIf.value.includes(actual)
    default:
      return true
  }
}

function validateAnswers(spec: FormSpec, answers: Record<string, unknown>): void {
  const missing: string[] = []
  for (const field of spec.fields) {
    if (!field.required) continue
    if (!fieldVisible(field, answers)) continue // conditional logic: hidden fields aren't required
    const v = answers[field.id]
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      missing.push(field.id)
    }
  }
  if (missing.length) {
    throw badRequest(`Missing required answers: ${missing.join(', ')}`, 'missing_answers')
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export default forms
