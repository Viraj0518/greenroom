// In-memory mock backend implementing the CONTRACTS.md API surface.
// Used automatically when the real API is unreachable (see api.ts). Seeded with
// a realistic conference so every screen demos well. State lives for the page
// session; a reload reseeds.

import { getSpeakerToken } from './api'
import { ApiError } from './api'
import type {
  Asset, Conflict, EmailTemplate, EventRec, FormDef, FormSpec, OnboardingTask,
  PortalMe, Resource, Review, ReviewRound, Room, ScheduleSlot, Speaker,
  Submission, SubmissionStatus, Track, User,
} from './types'
import { asObj, formSpec } from './types'

let n = 0
const id = (p: string) => `${p}_${(++n).toString(36).padStart(4, '0')}`
const now = () => new Date().toISOString()
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- seed

const EV = 'ev_demo'
const event: EventRec = {
  id: EV, name: 'DevConf 2026', slug: 'devconf-2026',
  starts_on: '2026-10-14', ends_on: '2026-10-16', timezone: 'America/Los_Angeles',
  description: 'Three days of hands-on engineering talks and workshops.',
  created_at: now(),
}

const admin: User = { id: 'u_admin', email: 'demo@greenroom.dev', name: 'Demo Organizer', role: 'admin' }
const reviewer: User = { id: 'u_rev', email: 'riley@greenroom.dev', name: 'Riley Chen', role: 'reviewer' }
let sessionUser: User | null = null

const tracks: Track[] = [
  { id: 'tr_ai', event_id: EV, name: 'AI & ML', color: '#8b5cf6', sort: 1 },
  { id: 'tr_web', event_id: EV, name: 'Web', color: '#0ea5e9', sort: 2 },
  { id: 'tr_devops', event_id: EV, name: 'DevOps', color: '#f59e0b', sort: 3 },
  { id: 'tr_product', event_id: EV, name: 'Product', color: '#ec4899', sort: 4 },
  { id: 'tr_sec', event_id: EV, name: 'Security', color: '#14b8a6', sort: 5 },
]

const rooms: Room[] = [
  { id: 'rm_main', event_id: EV, name: 'Main Stage', capacity: 300, sort: 1 },
  { id: 'rm_a', event_id: EV, name: 'Room A', capacity: 120, sort: 2 },
  { id: 'rm_b', event_id: EV, name: 'Room B', capacity: 80, sort: 3 },
  { id: 'rm_lab', event_id: EV, name: 'Workshop Lab', capacity: 40, sort: 4 },
]

const CATEGORIES = ['AI & ML', 'Web & Frontend', 'DevOps & Cloud', 'Product & Design', 'Security']

const cfpSpec: FormSpec = {
  fields: [
    { id: 'title', type: 'text', label: 'Talk title', required: true, maps: 'title',
      placeholder: 'A clear, specific title' },
    { id: 'abstract', type: 'textarea', label: 'Abstract', required: true, maps: 'abstract',
      hint: 'What will the audience learn? 2–4 paragraphs.' },
    { id: 'category', type: 'select', label: 'Category', required: true, isCategory: true, options: CATEGORIES },
    { id: 'format', type: 'select', label: 'Format', required: true,
      options: ['Talk (30 min)', 'Workshop (90 min)', 'Lightning (10 min)'] },
    { id: 'workshop_requirements', type: 'textarea', label: 'Workshop requirements',
      hint: 'Room setup, attendee prerequisites, laptop needed?',
      showIf: { fieldId: 'format', op: 'eq', value: 'Workshop (90 min)' } },
    { id: 'audience_level', type: 'select', label: 'Audience level', required: true,
      options: ['Beginner', 'Intermediate', 'Advanced'] },
    { id: 'previous_talks', type: 'url', label: 'Link to a previous talk (optional)',
      placeholder: 'https://…' },
    { id: 'first_time', type: 'checkbox', label: 'This is my first conference talk' },
    { id: 'mentorship', type: 'checkbox', label: 'I would like a speaking mentor',
      showIf: { fieldId: 'first_time', op: 'truthy' } },
    { id: 'travel_assistance', type: 'select', label: 'Do you need travel assistance?',
      options: ['No', 'Yes'] },
    { id: 'travel_details', type: 'textarea', label: 'Travel details',
      hint: 'Where are you travelling from? Approximate cost?',
      showIf: { fieldId: 'travel_assistance', op: 'eq', value: 'Yes' } },
  ],
  routing: [
    { whenCategory: 'AI & ML', assignTrack: 'AI & ML' },
    { whenCategory: 'Web & Frontend', assignTrack: 'Web' },
    { whenCategory: 'DevOps & Cloud', assignTrack: 'DevOps' },
    { whenCategory: 'Product & Design', assignTrack: 'Product' },
    { whenCategory: 'Security', assignTrack: 'Security' },
  ],
}

const forms: FormDef[] = [{
  id: 'form_cfp', event_id: EV, name: 'Call for Speakers — DevConf 2026', is_open: 1,
  opens_at: '2026-06-01T00:00:00Z', closes_at: '2026-09-01T00:00:00Z',
  spec_json: cfpSpec, created_at: now(),
}]

const SPEAKER_SEED: Array<[string, string, string, string]> = [
  ['Ada Okafor', 'ada@example.dev', 'Nimbus Labs', 'Distributed-systems engineer chasing tail latencies'],
  ['Marcus Webb', 'marcus@example.dev', 'Freelance', 'Frontend performance consultant'],
  ['Priya Natarajan', 'priya@example.dev', 'Kestrel AI', 'ML platform lead, ex-search infra'],
  ['Jonas Meyer', 'jonas@example.dev', 'CloudFoundry GmbH', 'Kubernetes whisperer'],
  ['Sofia Reyes', 'sofia@example.dev', 'Bloom', 'Design engineer bridging Figma and prod'],
  ['Tomasz Kowalski', 'tomasz@example.dev', 'SecureLayer', 'Breaks things so you don’t have to'],
  ['Amara Diallo', 'amara@example.dev', 'Fieldstone', 'Data engineer, DuckDB enthusiast'],
  ['Liam O’Connor', 'liam@example.dev', 'Postmark? No, Postgres', 'Database reliability engineer'],
  ['Yuki Tanaka', 'yuki@example.dev', 'Paper & Pixel', 'Accessibility advocate and TypeScript nerd'],
  ['Elena Petrova', 'elena@example.dev', 'Solo', 'Rust + WASM tinkerer'],
]

const speakers: Speaker[] = SPEAKER_SEED.map(([name, email, company, tagline], i) => ({
  id: `sp_${i}`, event_id: EV, email, name, company, tagline,
  bio: `${name} has spent the last decade building things at ${company}. ${tagline}. Regular speaker at community meetups; excited to share hard-won lessons at DevConf.`,
  headshot_key: null, links_json: { github: `https://github.com/${name.split(' ')[0].toLowerCase()}` },
  created_at: now(),
}))

const SUB_SEED: Array<[number, string, string, SubmissionStatus]> = [
  [0, 'Taming Tail Latency: p999 in Practice', 'DevOps & Cloud', 'accepted'],
  [1, 'The Cost of a Kilobyte: Frontend Performance Budgets', 'Web & Frontend', 'accepted'],
  [2, 'RAG Is a Distributed Systems Problem', 'AI & ML', 'accepted'],
  [3, 'Kubernetes Without the YAML Tears', 'DevOps & Cloud', 'in_review'],
  [4, 'Design Tokens at Scale', 'Product & Design', 'accepted'],
  [5, 'Your CI Is an Attack Surface', 'Security', 'accepted'],
  [6, 'DuckDB in the Pipeline: Small Data Wins', 'AI & ML', 'in_review'],
  [7, 'Postgres Disaster Stories (and Recoveries)', 'DevOps & Cloud', 'accepted'],
  [8, 'Screen Readers Don’t Read Your divs', 'Web & Frontend', 'accepted'],
  [9, 'WASM Beyond the Browser', 'Web & Frontend', 'in_review'],
  [3, 'GitOps Postmortems: What Broke and Why', 'DevOps & Cloud', 'submitted'],
  [6, 'Feature Stores Are Just Caches', 'AI & ML', 'submitted'],
  [4, 'Prototyping with Production Data (Safely)', 'Product & Design', 'waitlisted'],
  [8, 'Type-Safe i18n Without the Boilerplate', 'Web & Frontend', 'rejected'],
]

const trackForCategory = (cat: string) => {
  const rule = cfpSpec.routing.find((r) => r.whenCategory === cat)
  return rule ? tracks.find((t) => t.name === rule.assignTrack)?.name ?? null : null
}

const submissions: Submission[] = SUB_SEED.map(([spIdx, title, category, status], i) => ({
  id: `sub_${i}`, event_id: EV, form_id: 'form_cfp', speaker_id: `sp_${spIdx}`,
  title, category, track: trackForCategory(category),
  abstract: `${title}. This session walks through real production incidents, the metrics that mattered, and the playbook we wish we’d had. Attendees leave with concrete patterns they can apply the following week.`,
  answers_json: { format: i % 5 === 3 ? 'Workshop (90 min)' : 'Talk (30 min)', audience_level: ['Beginner', 'Intermediate', 'Advanced'][i % 3] },
  status, created_at: now(),
}))

const rounds: ReviewRound[] = [{
  id: 'rnd_1', event_id: EV, name: 'Round 1 — Program Committee', round_no: 1, is_open: 1,
  rubric_json: {
    criteria: [
      { key: 'relevance', label: 'Relevance to audience', max: 5 },
      { key: 'depth', label: 'Technical depth', max: 5 },
      { key: 'clarity', label: 'Clarity of abstract', max: 5 },
      { key: 'originality', label: 'Originality', max: 5 },
    ],
  },
}]

const reviews: Review[] = submissions.slice(0, 8).flatMap((s, i) => {
  const base: Review[] = [{
    id: id('rev'), round_id: 'rnd_1', submission_id: s.id, reviewer_id: reviewer.id,
    scores_json: { relevance: 3 + (i % 3), depth: 2 + (i % 4), clarity: 3 + ((i + 1) % 3), originality: 2 + ((i + 2) % 4) },
    comment: 'Solid abstract; would attend. Could use a sharper takeaway list.', ai: 0, created_at: now(),
  }]
  if (i % 2 === 0) base.push({
    id: id('rev'), round_id: 'rnd_1', submission_id: s.id, reviewer_id: 'ai',
    scores_json: { relevance: 4, depth: 3 + (i % 2), clarity: 4, originality: 3 },
    comment: 'AI review: clear structure and practical framing; abstract promises concrete artifacts (playbook, patterns) which fits the conference’s hands-on positioning.',
    ai: 1, created_at: now(),
  })
  return base
})

// Day-1 schedule with one deliberate conflict (Ada double-booked) so the
// conflict UI shows immediately in demos.
const slot = (i: number, subIdx: number | null, room: string | null, day: number, h: number, m: number, mins: number, kind = 'talk', title: string | null = null): ScheduleSlot => {
  const d = `2026-10-${14 + day}`
  const start = new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const end = new Date(start.getTime() + mins * 60000)
  const sub = subIdx != null ? submissions[subIdx] : null
  return {
    id: `slot_${i}`, event_id: EV, submission_id: sub?.id ?? null, room_id: room,
    track_id: sub?.track ? tracks.find((t) => t.name === sub.track)?.id ?? null : null,
    title: title ?? sub?.title ?? null,
    starts_at: start.toISOString(), ends_at: end.toISOString(), kind,
  }
}

let slots: ScheduleSlot[] = [
  slot(0, null, 'rm_main', 0, 16, 0, 30, 'break', 'Opening & Welcome'),
  slot(1, 0, 'rm_main', 0, 16, 30, 30),
  slot(2, 1, 'rm_a', 0, 16, 30, 30),
  slot(3, 2, 'rm_main', 0, 17, 15, 30),
  slot(4, 5, 'rm_b', 0, 17, 15, 30),
  slot(5, 4, 'rm_a', 0, 17, 15, 30),
  slot(6, null, 'rm_main', 0, 18, 0, 45, 'break', 'Lunch'),
  slot(7, 7, 'rm_main', 0, 18, 45, 30),
  // conflict: Ada (sub_0) also placed in Room B overlapping her Main Stage slot
  slot(8, 0, 'rm_b', 0, 16, 45, 30),
  slot(9, 8, 'rm_a', 1, 16, 30, 30),
]

const templates: EmailTemplate[] = [
  { id: 'tpl_1', event_id: EV, key: 'acceptance', name: 'Acceptance', subject: '\u{1F389} Your talk is in — DevConf 2026',
    body_md: 'Hi {{name}},\n\nGreat news — **{{talk_title}}** has been accepted for DevConf 2026!\n\nNext steps:\n\n1. Confirm in your [speaker portal]({{portal_url}})\n2. Upload your headshot and bio\n3. Watch for the schedule invite\n\nSee you in October,\nThe DevConf Program Team' },
  { id: 'tpl_2', event_id: EV, key: 'rejection', name: 'Rejection', subject: 'Your DevConf 2026 submission',
    body_md: 'Hi {{name}},\n\nThank you for submitting **{{talk_title}}**. Competition was intense this year and we couldn’t fit it into the program.\n\nWe’d genuinely love to see a submission from you next year.\n\nWarmly,\nThe DevConf Program Team' },
  { id: 'tpl_3', event_id: EV, key: 'reminder_slides', name: 'Slides reminder', subject: 'Reminder: slides due {{due_date}}',
    body_md: 'Hi {{name}},\n\nA friendly nudge — your slides for **{{talk_title}}** are due **{{due_date}}**. Upload them in your [speaker portal]({{portal_url}}).\n\nThanks!\n' },
  { id: 'tpl_4', event_id: EV, key: 'schedule_invite', name: 'Schedule + calendar invite', subject: 'You’re scheduled: {{talk_title}}',
    body_md: 'Hi {{name}},\n\nYour session **{{talk_title}}** is scheduled — the attached calendar invite has room and time.\n\nRoom details and AV specs are in the [speaker guide]({{portal_url}}).\n' },
]

interface EmailRow { id: string; event_id: string; speaker_id: string; template_key: string; subject: string; status: string; provider: string; created_at: string }
const emails: EmailRow[] = submissions.filter((s) => s.status === 'accepted').slice(0, 5).map((s) => ({
  id: id('em'), event_id: EV, speaker_id: s.speaker_id, template_key: 'acceptance',
  subject: '\u{1F389} Your talk is in — DevConf 2026', status: 'sent', provider: 'console', created_at: now(),
}))

const onboardingTasks: OnboardingTask[] = [
  { id: 'ot_1', event_id: EV, key: 'bio', label: 'Complete bio & tagline', due_at: '2026-08-05T00:00:00Z', required: 1 },
  { id: 'ot_2', event_id: EV, key: 'headshot', label: 'Upload headshot', due_at: '2026-08-20T00:00:00Z', required: 1 },
  { id: 'ot_3', event_id: EV, key: 'av_form', label: 'Confirm AV requirements', due_at: '2026-09-15T00:00:00Z', required: 1 },
  { id: 'ot_4', event_id: EV, key: 'slides', label: 'Upload slides', due_at: '2026-10-01T00:00:00Z', required: 1 },
  { id: 'ot_5', event_id: EV, key: 'travel', label: 'Submit travel details', due_at: '2026-09-01T00:00:00Z', required: 0 },
]

// speaker_id -> task_key -> done_at
const speakerTasks = new Map<string, Map<string, string>>()
speakers.forEach((sp, i) => {
  const m = new Map<string, string>()
  if (i % 3 !== 2) m.set('bio', now())
  if (i % 2 === 0) m.set('headshot', now())
  if (i % 4 === 0) m.set('av_form', now())
  speakerTasks.set(sp.id, m)
})

const resources: Resource[] = [
  { id: 'res_1', event_id: EV, title: 'Speaker Guide', slug: 'speaker-guide', is_public: 1, sort: 1, embed_html: null, updated_at: now(),
    body_md: '# Speaker Guide\n\nWelcome to DevConf 2026! Everything you need is on this page.\n\n## Timeline\n\n| Date | Milestone |\n|---|---|\n| Aug 20 | Headshot + bio due |\n| Sep 15 | AV form due |\n| Oct 1 | Slides due |\n| Oct 14–16 | Showtime \u{1F3A4} |\n\n## Talk formats\n\n- **Talk** — 30 min including Q&A\n- **Workshop** — 90 min, hands-on, max 40 attendees\n- **Lightning** — 10 min, no Q&A\n\n> Tip: rehearse with the countdown timer visible. The stage clock is aggressive.\n\n## Slides\n\n16:9, PDF preferred. Upload via your speaker portal — no email attachments, please.' },
  { id: 'res_2', event_id: EV, title: 'AV & Stage Specs', slug: 'av-specs', is_public: 1, sort: 2, updated_at: now(),
    body_md: '# AV & Stage Specs\n\nAll rooms have HDMI + USB-C, stage confidence monitors, and wireless lapel mics.\n\nStage layout below:',
    embed_html: '<div style="border:2px dashed #999;border-radius:12px;padding:24px;text-align:center;font-family:sans-serif"><strong>Main Stage layout</strong><div style="margin:12px auto;max-width:360px;display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px"><div style="background:#dbeafe;padding:16px;border-radius:8px">Confidence monitor</div><div style="background:#dcfce7;padding:16px;border-radius:8px">Podium + HDMI/USB-C</div><div style="background:#fef9c3;padding:16px;border-radius:8px">Q&amp;A mic</div></div><em>Embedded HTML block — rendered from resources.embed_html</em></div>' },
  { id: 'res_3', event_id: EV, title: 'Reimbursement Policy (internal)', slug: 'reimbursement', is_public: 0, sort: 3, embed_html: null, updated_at: now(),
    body_md: '# Reimbursement Policy\n\nInternal notes for organizers. Cap: $600 domestic / $1200 international. Requires receipts within 30 days.' },
]

const assets: Asset[] = []

const integrations = new Map<string, { config: Record<string, unknown>; last_synced_at: string | null; last_status: string | null }>()

// ---------------------------------------------------------------- helpers

const MAGIC = 'demo-speaker-token'
const magicSpeaker = new Map<string, string>([[MAGIC, 'sp_0']])

function currentSpeaker(): Speaker {
  const tok = getSpeakerToken()
  const spId = tok ? magicSpeaker.get(tok) : undefined
  const sp = speakers.find((s) => s.id === (spId ?? 'sp_0'))
  if (!sp) throw new ApiError(401, 'invalid speaker token')
  return sp
}

function requireOrganizer() {
  if (!sessionUser) throw new ApiError(401, 'not logged in')
  return sessionUser
}

function computeConflicts(): Conflict[] {
  const out: Conflict[] = []
  const overlap = (a: ScheduleSlot, b: ScheduleSlot) => a.starts_at < b.ends_at && b.starts_at < a.ends_at
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j]
      if (!overlap(a, b)) continue
      if (a.room_id && a.room_id === b.room_id && (a.kind === 'talk' || b.kind === 'talk')) {
        out.push({ slotIds: [a.id, b.id], reason: `Room double-booked: ${rooms.find((r) => r.id === a.room_id)?.name}` })
      }
      const spA = submissions.find((s) => s.id === a.submission_id)?.speaker_id
      const spB = submissions.find((s) => s.id === b.submission_id)?.speaker_id
      if (spA && spA === spB) {
        out.push({ slotIds: [a.id, b.id], reason: `Speaker double-booked: ${speakers.find((s) => s.id === spA)?.name}` })
      }
    }
  }
  return out
}

function joinSub(s: Submission): Submission {
  const sp = speakers.find((x) => x.id === s.speaker_id)
  return { ...s, speaker_name: sp?.name, speaker_email: sp?.email, speaker_company: sp?.company ?? undefined }
}

function portalMe(): PortalMe {
  const sp = currentSpeaker()
  const done = speakerTasks.get(sp.id) ?? new Map()
  return {
    speaker: sp,
    event: { id: EV, name: event.name, slug: event.slug, starts_on: event.starts_on, ends_on: event.ends_on, timezone: event.timezone },
    submissions: submissions.filter((s) => s.speaker_id === sp.id),
    tasks: onboardingTasks.map((t) => ({
      key: t.key, label: t.label, due_at: t.due_at, required: t.required,
      done: done.has(t.key) ? 1 : 0, done_at: done.get(t.key) ?? null,
    })),
    assets: assets.filter((a) => a.speaker_id === sp.id),
  }
}

function leaderboard() {
  return submissions
    .map((s) => {
      const rs = reviews.filter((r) => r.submission_id === s.id)
      if (rs.length === 0) return null
      const per: Record<string, number[]> = {}
      let total = 0, cnt = 0
      for (const r of rs) {
        const scores = asObj<Record<string, number>>(r.scores_json, {})
        for (const [k, v] of Object.entries(scores)) {
          ;(per[k] ??= []).push(v)
          total += v; cnt++
        }
      }
      return {
        submission: joinSub(s),
        avg_score: cnt ? +(total / cnt).toFixed(2) : 0,
        review_count: rs.filter((r) => !r.ai).length,
        ai_review_count: rs.filter((r) => r.ai).length,
        per_criterion: Object.fromEntries(Object.entries(per).map(([k, vs]) => [k, +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)])),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.avg_score - a.avg_score)
}

function dashboard() {
  const nowIso = now()
  const acceptedSpeakerIds = new Set(submissions.filter((s) => s.status === 'accepted').map((s) => s.speaker_id))
  const roster = speakers.filter((s) => acceptedSpeakerIds.has(s.id))
  let tasksDone = 0, overdueCount = 0
  const matrix = roster.map((sp) => {
    const done = speakerTasks.get(sp.id) ?? new Map()
    const overdue: string[] = []
    const tasks: Record<string, { done: number; done_at: string | null }> = {}
    for (const t of onboardingTasks) {
      const d = done.has(t.key)
      tasks[t.key] = { done: d ? 1 : 0, done_at: done.get(t.key) ?? null }
      if (d) tasksDone++
      else if (t.due_at && t.due_at < nowIso && t.required) { overdue.push(t.key); overdueCount++ }
    }
    return { speaker: { id: sp.id, name: sp.name, email: sp.email }, tasks, overdue }
  })
  return {
    counts: {
      speakers: roster.length,
      submissions: submissions.length,
      accepted: submissions.filter((s) => s.status === 'accepted').length,
      scheduled: slots.filter((s) => s.submission_id).length,
      tasks_done: tasksDone,
      tasks_total: roster.length * onboardingTasks.length,
      overdue: overdueCount,
    },
    task_defs: onboardingTasks,
    matrix,
  }
}

function publicSchedule() {
  return {
    event: { name: event.name, slug: event.slug, timezone: event.timezone },
    items: slots
      .slice()
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((sl) => {
        const sub = submissions.find((s) => s.id === sl.submission_id)
        const sp = sub ? speakers.find((s) => s.id === sub.speaker_id) : null
        const tr = tracks.find((t) => t.id === sl.track_id)
        return {
          id: sl.id, title: sl.title ?? sub?.title ?? 'TBA',
          starts_at: sl.starts_at, ends_at: sl.ends_at, kind: sl.kind,
          room: rooms.find((r) => r.id === sl.room_id)?.name ?? null,
          track: tr?.name ?? null, track_color: tr?.color ?? null,
          speaker: sp ? { name: sp.name, tagline: sp.tagline, headshot_url: null } : null,
        }
      }),
  }
}

// ---------------------------------------------------------------- router

type Handler = (m: RegExpMatchArray, body: any, form?: FormData) => unknown

const routes: Array<[string, RegExp, Handler]> = [
  // auth — any credentials work in demo mode
  ['POST', /^\/auth\/register$/, (_m, b) => { sessionUser = { ...admin, email: b.email, name: b.name }; return { user: sessionUser } }],
  ['POST', /^\/auth\/login$/, (_m, b) => {
    sessionUser = b.email?.startsWith('riley') ? reviewer : { ...admin, email: b.email || admin.email }
    return { user: sessionUser }
  }],
  ['POST', /^\/auth\/logout$/, () => { sessionUser = null; return undefined }],
  ['GET', /^\/auth\/me$/, () => ({ user: requireOrganizer() })],

  // events
  ['GET', /^\/events$/, () => { requireOrganizer(); return [event] }],
  ['GET', /^\/events\/([^/]+)$/, () => { requireOrganizer(); return event }],
  ['PATCH', /^\/events\/([^/]+)$/, (_m, b) => { requireOrganizer(); Object.assign(event, b); return event }],

  // forms
  ['GET', /^\/events\/([^/]+)\/forms$/, () => { requireOrganizer(); return forms }],
  ['POST', /^\/events\/([^/]+)\/forms$/, (_m, b) => {
    requireOrganizer()
    const f: FormDef = { id: id('form'), event_id: EV, name: b.name ?? 'Untitled form', is_open: b.is_open ?? 1,
      opens_at: b.opens_at ?? null, closes_at: b.closes_at ?? null,
      spec_json: b.spec_json ?? { fields: [], routing: [] }, created_at: now() }
    forms.push(f); return f
  }],
  ['GET', /^\/forms\/([^/]+)$/, (m) => { requireOrganizer(); const f = forms.find((x) => x.id === m[1]); if (!f) throw new ApiError(404, 'form not found'); return f }],
  ['PATCH', /^\/forms\/([^/]+)$/, (m, b) => {
    requireOrganizer()
    const f = forms.find((x) => x.id === m[1]); if (!f) throw new ApiError(404, 'form not found')
    Object.assign(f, b); return f
  }],
  ['GET', /^\/public\/forms\/([^/]+)$/, (m) => {
    const f = forms.find((x) => x.id === m[1]); if (!f) throw new ApiError(404, 'form not found')
    return { id: f.id, name: f.name, is_open: f.is_open, event: { id: EV, name: event.name, slug: event.slug }, spec: formSpec(f) }
  }],
  ['POST', /^\/public\/forms\/([^/]+)\/submit$/, (m, b) => {
    const f = forms.find((x) => x.id === m[1]); if (!f) throw new ApiError(404, 'form not found')
    const spec = formSpec(f)
    let sp = speakers.find((s) => s.email === b.speaker.email)
    if (!sp) {
      sp = { id: id('sp'), event_id: EV, email: b.speaker.email, name: b.speaker.name, bio: b.speaker.bio ?? null,
        tagline: null, company: null, headshot_key: null, links_json: null, created_at: now() }
      speakers.push(sp)
      speakerTasks.set(sp.id, new Map())
    }
    const catField = spec.fields.find((x) => x.isCategory)
    const category = catField ? String(b.answers[catField.id] ?? '') : null
    const titleField = spec.fields.find((x) => x.maps === 'title')
    const absField = spec.fields.find((x) => x.maps === 'abstract')
    const sub: Submission = {
      id: id('sub'), event_id: EV, form_id: f.id, speaker_id: sp.id,
      title: String((titleField && b.answers[titleField.id]) ?? 'Untitled'),
      abstract: String((absField && b.answers[absField.id]) ?? ''),
      category, track: category ? trackForCategory(category) : null,
      answers_json: b.answers, status: 'submitted', created_at: now(),
    }
    submissions.push(sub)
    const token = `magic_${sp.id}`
    magicSpeaker.set(token, sp.id)
    emails.push({ id: id('em'), event_id: EV, speaker_id: sp.id, template_key: 'confirmation',
      subject: `We got it: ${sub.title}`, status: 'sent', provider: 'console', created_at: now() })
    return { submission_id: sub.id, speaker_id: sp.id, magic_token: token }
  }],

  // submissions
  ['GET', /^\/events\/([^/]+)\/submissions(?:\?(.*))?$/, (m) => {
    requireOrganizer()
    const q = new URLSearchParams(m[2] ?? '')
    let out = submissions.map(joinSub)
    if (q.get('status')) out = out.filter((s) => s.status === q.get('status'))
    if (q.get('track')) out = out.filter((s) => s.track === q.get('track'))
    const needle = q.get('q')?.toLowerCase()
    if (needle) out = out.filter((s) => s.title.toLowerCase().includes(needle) || s.speaker_name?.toLowerCase().includes(needle))
    return out
  }],
  ['PATCH', /^\/submissions\/([^/]+)$/, (m, b) => {
    requireOrganizer()
    const s = submissions.find((x) => x.id === m[1]); if (!s) throw new ApiError(404, 'submission not found')
    Object.assign(s, b); return joinSub(s)
  }],

  // portal
  ['GET', /^\/portal\/me$/, () => portalMe()],
  ['PATCH', /^\/portal\/me$/, (_m, b) => {
    const sp = currentSpeaker()
    Object.assign(sp, b)
    if (b.bio || b.tagline) speakerTasks.get(sp.id)?.set('bio', now())
    return portalMe()
  }],
  ['POST', /^\/portal\/assets$/, (_m, _b, form) => {
    const sp = currentSpeaker()
    const kind = String(form?.get('kind') ?? 'document') as Asset['kind']
    const file = form?.get('file') as File | null
    const a: Asset = { id: id('as'), event_id: EV, speaker_id: sp.id, submission_id: null, kind,
      r2_key: `mock/${sp.id}/${file?.name ?? 'file'}`, filename: file?.name ?? 'file',
      content_type: file?.type ?? 'application/octet-stream', size: file?.size ?? 0, created_at: now() }
    assets.push(a)
    const taskKey = kind === 'headshot' ? 'headshot' : kind === 'slides' ? 'slides' : null
    if (taskKey) speakerTasks.get(sp.id)?.set(taskKey, now())
    if (kind === 'headshot') sp.headshot_key = a.r2_key
    return a
  }],
  ['DELETE', /^\/portal\/assets\/([^/]+)$/, (m) => {
    const sp = currentSpeaker()
    const i = assets.findIndex((a) => a.id === m[1] && a.speaker_id === sp.id)
    if (i >= 0) assets.splice(i, 1)
    return undefined
  }],
  ['POST', /^\/portal\/tasks\/([^/]+)\/done$/, (m) => {
    const sp = currentSpeaker()
    speakerTasks.get(sp.id)?.set(m[1], now())
    return portalMe()
  }],

  // reviews
  ['GET', /^\/events\/([^/]+)\/rounds$/, () => { requireOrganizer(); return rounds }],
  ['POST', /^\/events\/([^/]+)\/rounds$/, (_m, b) => {
    requireOrganizer()
    const r: ReviewRound = { id: id('rnd'), event_id: EV, name: b.name ?? 'New round', round_no: rounds.length + 1,
      rubric_json: b.rubric_json ?? { criteria: [] }, is_open: 1 }
    rounds.push(r); return r
  }],
  ['GET', /^\/rounds\/([^/]+)\/queue$/, (m) => {
    const user = requireOrganizer()
    return submissions
      .filter((s) => ['submitted', 'in_review'].includes(s.status) || reviews.some((r) => r.submission_id === s.id))
      .map((s) => ({
        submission: joinSub(s),
        my_review: reviews.find((r) => r.round_id === m[1] && r.submission_id === s.id && r.reviewer_id === user.id) ?? null,
        review_count: reviews.filter((r) => r.round_id === m[1] && r.submission_id === s.id).length,
      }))
  }],
  ['POST', /^\/rounds\/([^/]+)\/submissions\/([^/]+)\/review$/, (m, b) => {
    const user = requireOrganizer()
    const existing = reviews.find((r) => r.round_id === m[1] && r.submission_id === m[2] && r.reviewer_id === user.id)
    if (existing) { existing.scores_json = b.scores_json; existing.comment = b.comment; return existing }
    const r: Review = { id: id('rev'), round_id: m[1], submission_id: m[2], reviewer_id: user.id,
      scores_json: b.scores_json, comment: b.comment, ai: 0, created_at: now() }
    reviews.push(r)
    const sub = submissions.find((s) => s.id === m[2])
    if (sub && sub.status === 'submitted') sub.status = 'in_review'
    return r
  }],
  ['POST', /^\/rounds\/([^/]+)\/submissions\/([^/]+)\/ai-review$/, async (m) => {
    requireOrganizer()
    await delay(900) // simulate model latency
    const sub = submissions.find((s) => s.id === m[2]); if (!sub) throw new ApiError(404, 'submission not found')
    const h = [...sub.id].reduce((a, c) => a + c.charCodeAt(0), 0)
    const r: Review = {
      id: id('rev'), round_id: m[1], submission_id: m[2], reviewer_id: 'ai',
      scores_json: { relevance: 3 + (h % 3), depth: 2 + (h % 4), clarity: 3 + ((h >> 2) % 3), originality: 2 + ((h >> 3) % 4) },
      comment: `AI review: “${sub.title}” presents a concrete, experience-backed premise. The abstract commits to actionable takeaways, which matches this event’s hands-on audience. Consider asking the speaker for an outline to validate depth. (Demo-mode review — deploy with ANTHROPIC_API_KEY for real analysis.)`,
      ai: 1, created_at: now(),
    }
    reviews.push(r); return r
  }],
  ['GET', /^\/events\/([^/]+)\/leaderboard(?:\?.*)?$/, () => { requireOrganizer(); return leaderboard() }],

  // schedule
  ['GET', /^\/events\/([^/]+)\/rooms$/, () => rooms],
  ['POST', /^\/events\/([^/]+)\/rooms$/, (_m, b) => {
    requireOrganizer()
    const r: Room = { id: id('rm'), event_id: EV, name: b.name, capacity: b.capacity ?? null, sort: rooms.length + 1 }
    rooms.push(r); return r
  }],
  ['GET', /^\/events\/([^/]+)\/tracks$/, () => tracks],
  ['POST', /^\/events\/([^/]+)\/tracks$/, (_m, b) => {
    requireOrganizer()
    const t: Track = { id: id('tr'), event_id: EV, name: b.name, color: b.color ?? '#8b5cf6', sort: tracks.length + 1 }
    tracks.push(t); return t
  }],
  ['GET', /^\/events\/([^/]+)\/schedule$/, () => { requireOrganizer(); return { slots, conflicts: computeConflicts() } }],
  ['POST', /^\/events\/([^/]+)\/schedule\/slots$/, (_m, b) => {
    requireOrganizer()
    const sub = submissions.find((s) => s.id === b.submission_id)
    const sl: ScheduleSlot = { id: id('slot'), event_id: EV, submission_id: b.submission_id ?? null,
      room_id: b.room_id ?? null,
      track_id: b.track_id ?? (sub?.track ? tracks.find((t) => t.name === sub.track)?.id ?? null : null),
      title: b.title ?? sub?.title ?? null, starts_at: b.starts_at, ends_at: b.ends_at, kind: b.kind ?? 'talk' }
    slots.push(sl)
    return { slot: sl, conflicts: computeConflicts() }
  }],
  ['PATCH', /^\/slots\/([^/]+)$/, (m, b) => {
    requireOrganizer()
    const sl = slots.find((x) => x.id === m[1]); if (!sl) throw new ApiError(404, 'slot not found')
    Object.assign(sl, b)
    return { slot: sl, conflicts: computeConflicts() }
  }],
  ['DELETE', /^\/slots\/([^/]+)$/, (m) => {
    requireOrganizer()
    slots = slots.filter((x) => x.id !== m[1])
    return { conflicts: computeConflicts() }
  }],

  // comms
  ['GET', /^\/events\/([^/]+)\/templates$/, () => { requireOrganizer(); return templates }],
  ['POST', /^\/events\/([^/]+)\/templates$/, (_m, b) => {
    requireOrganizer()
    const t: EmailTemplate = { id: id('tpl'), event_id: EV, key: b.key ?? id('key'), name: b.name ?? 'New template',
      subject: b.subject ?? '', body_md: b.body_md ?? '' }
    templates.push(t); return t
  }],
  ['PATCH', /^\/templates\/([^/]+)$/, (m, b) => {
    requireOrganizer()
    const t = templates.find((x) => x.id === m[1]); if (!t) throw new ApiError(404, 'template not found')
    Object.assign(t, b); return t
  }],
  ['POST', /^\/events\/([^/]+)\/send$/, async (_m, b) => {
    requireOrganizer()
    await delay(600)
    const tpl = templates.find((t) => t.key === b.template_key)
    if (!tpl) throw new ApiError(404, 'template not found')
    let targets: Speaker[]
    if (b.speaker_ids?.length) targets = speakers.filter((s) => b.speaker_ids.includes(s.id))
    else if (b.filter?.status) {
      const ids = new Set(submissions.filter((s) => s.status === b.filter.status).map((s) => s.speaker_id))
      targets = speakers.filter((s) => ids.has(s.id))
    } else targets = []
    for (const sp of targets) {
      emails.push({ id: id('em'), event_id: EV, speaker_id: sp.id, template_key: tpl.key,
        subject: tpl.subject.replace('{{name}}', sp.name).replace('{{talk_title}}', submissions.find((s) => s.speaker_id === sp.id)?.title ?? '').replace('{{due_date}}', 'Oct 1'),
        status: 'sent', provider: 'console', created_at: now() })
    }
    return { sent: targets.length, skipped: 0, errors: [] }
  }],
  ['GET', /^\/events\/([^/]+)\/emails$/, () => {
    requireOrganizer()
    return emails.slice().reverse().map((e) => ({
      ...e,
      speaker_name: speakers.find((s) => s.id === e.speaker_id)?.name,
      speaker_email: speakers.find((s) => s.id === e.speaker_id)?.email,
    }))
  }],

  // dashboard
  ['GET', /^\/events\/([^/]+)\/dashboard$/, () => { requireOrganizer(); return dashboard() }],

  // resources
  ['GET', /^\/events\/([^/]+)\/resources$/, () => { requireOrganizer(); return resources }],
  ['POST', /^\/events\/([^/]+)\/resources$/, (_m, b) => {
    requireOrganizer()
    const r: Resource = { id: id('res'), event_id: EV, title: b.title ?? 'Untitled', slug: b.slug ?? id('page'),
      body_md: b.body_md ?? '', embed_html: b.embed_html ?? null, is_public: b.is_public ?? 0,
      sort: resources.length + 1, updated_at: now() }
    resources.push(r); return r
  }],
  ['GET', /^\/resources\/([^/]+)$/, (m) => { requireOrganizer(); const r = resources.find((x) => x.id === m[1]); if (!r) throw new ApiError(404, 'not found'); return r }],
  ['PATCH', /^\/resources\/([^/]+)$/, (m, b) => {
    requireOrganizer()
    const r = resources.find((x) => x.id === m[1]); if (!r) throw new ApiError(404, 'not found')
    Object.assign(r, b, { updated_at: now() }); return r
  }],
  ['DELETE', /^\/resources\/([^/]+)$/, (m) => {
    requireOrganizer()
    const i = resources.findIndex((x) => x.id === m[1]); if (i >= 0) resources.splice(i, 1)
    return undefined
  }],
  ['GET', /^\/public\/events\/([^/]+)\/resources$/, () => resources.filter((r) => r.is_public)],
  ['GET', /^\/public\/events\/([^/]+)\/resources\/([^/]+)$/, (m) => {
    const r = resources.find((x) => x.slug === m[2] && x.is_public); if (!r) throw new ApiError(404, 'not found')
    return r
  }],

  // public embeds
  ['GET', /^\/public\/events\/([^/]+)\/speakers$/, () => ({
    event: { name: event.name, slug: event.slug },
    speakers: speakers
      .filter((sp) => submissions.some((s) => s.speaker_id === sp.id && s.status === 'accepted'))
      .map((sp) => ({ id: sp.id, name: sp.name, tagline: sp.tagline, company: sp.company, bio: sp.bio, headshot_url: null })),
  })],
  ['GET', /^\/public\/events\/([^/]+)\/schedule$/, () => publicSchedule()],

  // integrations
  ['GET', /^\/events\/([^/]+)\/integrations\/([^/]+)$/, (m) => {
    requireOrganizer()
    const st = integrations.get(m[2])
    return { id: `int_${m[2]}`, event_id: EV, kind: m[2], config_json: st?.config ?? {},
      last_synced_at: st?.last_synced_at ?? null, last_status: st?.last_status ?? null, configured: !!st }
  }],
  ['PUT', /^\/events\/([^/]+)\/integrations\/([^/]+)$/, (m, b) => {
    requireOrganizer()
    integrations.set(m[2], { config: b.config ?? {}, last_synced_at: null, last_status: null })
    return { id: `int_${m[2]}`, event_id: EV, kind: m[2], config_json: b.config ?? {}, last_synced_at: null, last_status: null, configured: true }
  }],
  ['POST', /^\/events\/([^/]+)\/integrations\/([^/]+)\/sync$/, async (m) => {
    requireOrganizer()
    await delay(700)
    const st = integrations.get(m[2])
    if (!st) return { ok: false, pushed: {}, message: `${m[2]} is not configured — add an API key first (graceful no-op).` }
    st.last_synced_at = now(); st.last_status = 'ok'
    return { ok: true, pushed: { speakers: speakers.length, sessions: slots.filter((s) => s.submission_id).length }, message: 'Demo sync complete.' }
  }],
]

export async function mockRequest(method: string, path: string, body?: unknown, form?: FormData): Promise<unknown> {
  await delay(80 + (path.length % 7) * 30) // feel like a network
  for (const [m, re, h] of routes) {
    if (m !== method) continue
    const match = path.match(re)
    if (match) return h(match, body as any, form)
  }
  throw new ApiError(404, `mock: no route for ${method} ${path}`)
}

/** Demo magic-link token surfaced in the login screen + CFP success page. */
export const DEMO_SPEAKER_TOKEN = MAGIC
