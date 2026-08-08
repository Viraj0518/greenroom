// Types mirroring CONTRACTS.md (D1 schema v1 + API responses).
// Where CONTRACTS leaves a response body unspecified, the shape here is the
// UI's concrete proposal — backend should match or flag via the coordinator.

export type SubmissionStatus =
  | 'submitted' | 'in_review' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn'

export interface EventRec {
  id: string
  name: string
  slug: string
  starts_on: string
  ends_on: string
  timezone: string
  description: string | null
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
  created_at?: string
}

export interface SpeakerLinks { website?: string; twitter?: string; linkedin?: string; github?: string }

export interface Speaker {
  id: string
  event_id: string
  email: string
  name: string
  bio: string | null
  tagline: string | null
  company: string | null
  headshot_key: string | null
  links_json: string | SpeakerLinks | null
  created_at: string
}

// ----- forms -----

export type FieldType =
  | 'text' | 'textarea' | 'email' | 'url' | 'number' | 'select' | 'multiselect' | 'checkbox'

export interface ShowIf { fieldId: string; op: 'eq' | 'neq' | 'contains' | 'truthy'; value?: unknown }

/**
 * Reserved field ids (pinned decision 2026-08-08): every form must include a
 * required field with id 'title'; optional reserved ids 'abstract' and
 * 'category'. The server lifts these from answers into submission columns,
 * and 'category' drives track routing.
 */
export const RESERVED_FIELD_IDS = ['title', 'abstract', 'category'] as const

export interface FieldSpec {
  id: string
  type: FieldType
  label: string
  required?: boolean
  placeholder?: string
  hint?: string
  options?: string[]
  showIf?: ShowIf
}

export interface RoutingRule { whenCategory: string; assignTrack: string }

export interface FormSpec { fields: FieldSpec[]; routing: RoutingRule[] }

// API rows carry `spec` as an object; spec_json never crosses the API boundary.
export interface FormDef {
  id: string
  event_id: string
  name: string
  is_open: number
  opens_at: string | null
  closes_at: string | null
  spec: FormSpec
  created_at: string
}

/** GET /api/public/forms/:formId — {form: {...row, open}, event} */
export interface PublicFormResponse {
  form: FormDef & { open: number | boolean }
  event: { id: string; name: string; slug: string }
}

// ----- submissions -----

export interface Submission {
  id: string
  event_id: string
  form_id: string
  speaker_id: string
  title: string
  abstract: string | null
  category: string | null
  track: string | null
  answers_json: string | Record<string, unknown> | null
  /** organizer list endpoints return answers pre-parsed */
  answers?: Record<string, unknown>
  status: SubmissionStatus
  created_at: string
  // joined by backend on organizer list endpoints
  speaker_name?: string
  speaker_email?: string
  speaker_company?: string
  // portal/me only (2026-08-08): schedule + calendar links, null unless accepted+scheduled
  slot?: { starts_at: string; ends_at: string; room: string | null } | null
  gcal_link?: string | null
  outlook_link?: string | null
}

// ----- reviews -----

export interface RubricCriterion { key: string; label: string; max: number; description?: string }
export interface Rubric { criteria: RubricCriterion[] }

// API rows carry `rubric` as an object (null when unset).
export interface ReviewRound {
  id: string
  event_id: string
  name: string
  round_no: number
  rubric: Rubric | null
  is_open: number
}

export interface Review {
  id: string
  round_id: string
  submission_id: string
  reviewer_id: string
  scores_json: string | Record<string, number>
  comment: string | null
  ai: number
  created_at: string
}

/** GET /api/rounds/:id/queue row (flat — mirrors reviews.ts). */
export interface QueueRow {
  id: string
  title: string
  abstract: string | null
  category: string | null
  track: string | null
  status: SubmissionStatus
  answers: Record<string, unknown>
  speaker_name: string
  speaker_company: string | null
  my_review: { id: string; scores: Record<string, number>; comment: string | null } | null
}

export interface QueueResponse { round: ReviewRound; queue: QueueRow[] }

// Pinned decision 2026-08-08: rows arrive sorted (score DESC, nulls last,
// tie title ASC); score = mean of per-review totals, 2dp, null when no reviews.
export interface LeaderboardRow {
  submission_id: string
  title: string
  category: string | null
  track: string | null
  speaker_name: string
  review_count: number
  ai_review_count: number
  score: number | null
}

export interface LeaderboardResponse { round_id: string; rows: LeaderboardRow[] }

// ----- schedule -----

export interface Room { id: string; event_id: string; name: string; capacity: number | null; sort: number }
export interface Track { id: string; event_id: string; name: string; color: string; sort: number }

export interface ScheduleSlot {
  id: string
  event_id: string
  submission_id: string | null
  room_id: string | null
  track_id: string | null
  title: string | null
  starts_at: string
  ends_at: string
  kind: 'talk' | 'break' | string
  // joined by backend on schedule GET (2026-08-08)
  speaker_id?: string | null
  speaker_name?: string | null
  submission_title?: string | null
  submission_track?: string | null
  room_name?: string | null
  track_name?: string | null
  track_color?: string | null
}

export interface Conflict { slotIds: string[]; reason: string }

export interface ScheduleResponse { slots: ScheduleSlot[]; conflicts: Conflict[] }

/** Slot create/patch: the created/updated row's fields spread + fresh {slots, conflicts}. */
export type ScheduleMutationResponse = ScheduleResponse & Partial<ScheduleSlot>

// ----- comms -----

export interface EmailTemplate {
  id: string
  event_id: string
  key: string
  name: string
  subject: string
  body_md: string
}

export interface EmailLogRow {
  id: string
  event_id: string
  speaker_id: string
  speaker_name?: string
  speaker_email?: string
  template_key: string
  subject: string
  status: string
  provider: string
  created_at: string
}

export interface SendResult { requested: number; sent: number; failed: number; errors: string[] }

// ----- onboarding / dashboard -----

export interface OnboardingTask {
  id: string
  event_id: string
  key: string
  label: string
  due_at: string | null
  required: number
}

export interface PortalTask {
  key: string
  label: string
  due_at: string | null
  required: number
  done: number
  done_at: string | null
}

export interface Asset {
  id: string
  event_id: string
  speaker_id: string | null
  submission_id: string | null
  kind: 'headshot' | 'slides' | 'document'
  r2_key: string
  filename: string
  content_type: string
  size: number
  created_at: string
}

export interface PortalMe {
  speaker: Speaker
  event: { id: string; name: string; slug: string; starts_on: string; ends_on: string; timezone: string }
  submissions: Submission[]
  tasks: PortalTask[]
  assets: Asset[]
  /** speaker's personal ICS feed (2026-08-08) */
  ics_url?: string
}

// Shape mirrors functions/src/routes/dashboard.ts exactly (verified 2026-08-08
// after a staging crash from drift — do not re-guess this).
export interface DashboardTaskDef { key: string; label: string; due_at: string | null; required: number }
export interface DashboardCell { done: boolean; done_at: string | null; overdue: boolean }

export interface DashboardSpeakerRow {
  speaker: { id: string; name: string; email: string; company: string | null; headshot_key: string | null }
  tasks: Record<string, DashboardCell>
  done_count: number
  overdue_count: number
  complete: boolean
}

export interface DashboardData {
  tasks: DashboardTaskDef[]
  speakers: DashboardSpeakerRow[]
  counts: {
    speakers: number
    tasks: number
    complete_speakers: number
    overdue: number
    submissions_by_status: Record<string, number>
  }
}

// ----- resources -----

export interface Resource {
  id: string
  event_id: string
  title: string
  slug: string
  body_md: string
  embed_html: string | null
  is_public: number
  sort: number
  updated_at: string
}

// ----- integrations -----

// Mirrors integrations.ts: config is masked, secrets write-only; keys are
// camelCase per CONFIG_SCHEMA (apiKey/eventId/baseUrl for accelevents,
// apiKey/baseId for airtable).
export interface Integration {
  kind: 'accelevents' | 'airtable' | string
  configured: boolean
  config: Record<string, unknown>
  last_synced_at?: string | null
  last_status?: string | null
}

export interface SyncResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  pushed?: number | Record<string, number>
  error?: string
}

// ----- public embeds -----

export interface PublicSpeaker {
  id: string
  name: string
  tagline: string | null
  company: string | null
  bio: string | null
  headshot_url: string | null
}

export interface PublicSpeakersResponse {
  event: { name: string; slug: string }
  speakers: PublicSpeaker[]
}

export interface PublicScheduleItem {
  id: string
  title: string
  starts_at: string
  ends_at: string
  kind: string
  room: string | null
  track: string | null
  track_color: string | null
  speaker: { name: string; tagline: string | null; headshot_url: string | null } | null
}

export interface PublicScheduleResponse {
  event: { name: string; slug: string; timezone: string }
  items: PublicScheduleItem[]
}

// ----- helpers for TEXT-json columns (backend may return string or object) -----

export function asObj<T>(v: string | T | null | undefined, fallback: T): T {
  if (v == null) return fallback
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T } catch { return fallback }
  }
  return v
}

export function formSpec(f: { spec?: FormSpec | null }): FormSpec {
  const s = f.spec ?? { fields: [], routing: [] }
  return { fields: s.fields ?? [], routing: s.routing ?? [] }
}

export function rubric(r: { rubric: Rubric | null }): Rubric {
  return r.rubric ?? { criteria: [] }
}

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In review',
  accepted: 'Accepted',
  rejected: 'Rejected',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
}

export const STATUS_BADGE: Record<SubmissionStatus, string> = {
  submitted: 'badge-info',
  in_review: 'badge-warn',
  accepted: 'badge-ok',
  rejected: 'badge-danger',
  waitlisted: 'badge-accent',
  withdrawn: '',
}
