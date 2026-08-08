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

export interface FormDef {
  id: string
  event_id: string
  name: string
  is_open: number
  opens_at: string | null
  closes_at: string | null
  spec_json: string | FormSpec
  created_at: string
}

export interface PublicForm {
  id: string
  name: string
  is_open: number
  event: { id: string; name: string; slug: string }
  spec: FormSpec
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
  status: SubmissionStatus
  created_at: string
  // joined by backend on organizer list endpoints
  speaker_name?: string
  speaker_email?: string
  speaker_company?: string
}

// ----- reviews -----

export interface RubricCriterion { key: string; label: string; max: number; description?: string }
export interface Rubric { criteria: RubricCriterion[] }

export interface ReviewRound {
  id: string
  event_id: string
  name: string
  round_no: number
  rubric_json: string | Rubric
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

export interface QueueItem { submission: Submission; my_review: Review | null; review_count: number }

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
}

export interface Conflict { slotIds: string[]; reason: string }

export interface ScheduleResponse { slots: ScheduleSlot[]; conflicts: Conflict[] }

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

export interface SendResult { sent: number; skipped: number; errors: string[] }

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
}

export interface DashboardMatrixRow {
  speaker: { id: string; name: string; email: string }
  tasks: Record<string, { done: number; done_at: string | null }>
  overdue: string[]
}

export interface DashboardData {
  counts: {
    speakers: number
    submissions: number
    accepted: number
    scheduled: number
    tasks_done: number
    tasks_total: number
    overdue: number
  }
  task_defs: OnboardingTask[]
  matrix: DashboardMatrixRow[]
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

export interface Integration {
  id: string
  event_id: string
  kind: 'accelevents' | 'airtable'
  config_json: string | Record<string, unknown>
  last_synced_at: string | null
  last_status: string | null
  configured?: boolean
}

export interface SyncResult { ok: boolean; pushed: Record<string, number>; message: string }

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

export function formSpec(f: { spec_json: string | FormSpec }): FormSpec {
  return asObj<FormSpec>(f.spec_json, { fields: [], routing: [] })
}

export function rubric(r: { rubric_json: string | Rubric }): Rubric {
  return asObj<Rubric>(r.rubric_json, { criteria: [] })
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
