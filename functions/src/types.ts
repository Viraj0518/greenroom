// Minimal structural types for the Workers runtime objects we use, so the
// backend typechecks standalone before @cloudflare/workers-types lands at the
// repo root. These are structurally compatible with the real types.

export interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta?: Record<string, unknown>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(stmts: D1PreparedStatement[]): Promise<D1Result[]>
}

export interface R2ObjectBody {
  body: ReadableStream
  size: number
  httpMetadata?: { contentType?: string }
}

export interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    opts?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
  delete(key: string): Promise<void>
}

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  APP_BASE_URL?: string
  EMAIL_FROM?: string
  RESEND_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

// --- row types (CONTRACTS.md D1 schema v1) ---

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
}

export interface Speaker {
  id: string
  event_id: string
  email: string
  name: string
  bio: string | null
  tagline: string | null
  company: string | null
  headshot_key: string | null
  links_json: string | null
  magic_token: string
  onboarding_json: string | null
  created_at: string
}

export interface Submission {
  id: string
  event_id: string
  form_id: string
  speaker_id: string
  title: string
  abstract: string | null
  category: string | null
  track: string | null
  answers_json: string | null
  status: 'submitted' | 'in_review' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn'
  created_at: string
}

export interface ScheduleSlot {
  id: string
  event_id: string
  submission_id: string | null
  room_id: string | null
  track_id: string | null
  title: string | null
  starts_at: string
  ends_at: string
  kind: string
}

export type Vars = {
  user?: User
  speaker?: Speaker
}

export type AppEnv = { Bindings: Env; Variables: Vars }

export const SUBMISSION_STATUSES = [
  'submitted',
  'in_review',
  'accepted',
  'rejected',
  'waitlisted',
  'withdrawn',
] as const

export const ASSET_KINDS = ['headshot', 'slides', 'document'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]
