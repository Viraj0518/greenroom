// Typed API client for every CONTRACTS.md route.
// If the backend is unreachable (pure `vite` dev without wrangler, or forced via
// VITE_USE_MOCKS=1) requests transparently fall back to the in-memory mock store
// in mocks.ts, so the UI is never blocked on backend progress.

import type {
  Asset, Conflict, DashboardData, EmailLogRow, EmailTemplate, EventRec, FormDef,
  Integration, LeaderboardRow, PortalMe, PublicForm, PublicScheduleResponse,
  PublicSpeakersResponse, QueueItem, Resource, Review, ReviewRound, Room,
  ScheduleResponse, ScheduleSlot, SendResult, Submission, SubmissionStatus,
  SyncResult, Track, User,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const FORCE_MOCKS = import.meta.env.VITE_USE_MOCKS === '1'
let mockActive = FORCE_MOCKS

/** True once any request has been served by the mock store (drives the demo-data chip). */
export function usingMocks() { return mockActive }

let speakerToken: string | null = null
export function setSpeakerToken(t: string | null) { speakerToken = t }
export function getSpeakerToken() { return speakerToken }

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

async function req<T>(method: Method, path: string, body?: unknown, form?: FormData): Promise<T> {
  if (!mockActive) {
    try {
      const headers: Record<string, string> = {}
      if (speakerToken) headers['Authorization'] = `Bearer ${speakerToken}`
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      const res = await fetch(`/api${path}`, {
        method,
        credentials: 'include',
        headers,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      })
      const ct = res.headers.get('content-type') ?? ''
      // A vite dev server without the API proxy target answers /api/* with the SPA
      // index.html — treat that exactly like "backend not running".
      if (ct.includes('text/html')) throw new TypeError('no backend (html response)')
      if (!res.ok) {
        let msg = res.statusText
        try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* keep statusText */ }
        throw new ApiError(res.status, msg)
      }
      if (res.status === 204) return undefined as T
      return (await res.json()) as T
    } catch (e) {
      if (e instanceof ApiError) throw e
      // network-level failure → switch this session to mock mode
      mockActive = true
      console.info('[greenroom] backend unreachable — using demo data', e)
    }
  }
  const { mockRequest } = await import('./mocks')
  return mockRequest(method, path, body, form) as Promise<T>
}

export const api = {
  // ----- auth -----
  register: (b: { email: string; name: string; password: string }) =>
    req<{ user: User }>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => req<{ user: User }>('POST', '/auth/login', b),
  logout: () => req<void>('POST', '/auth/logout'),
  me: () => req<{ user: User }>('GET', '/auth/me'),

  // ----- events -----
  listEvents: () => req<EventRec[]>('GET', '/events'),
  createEvent: (b: Partial<EventRec>) => req<EventRec>('POST', '/events', b),
  getEvent: (id: string) => req<EventRec>('GET', `/events/${id}`),
  updateEvent: (id: string, b: Partial<EventRec>) => req<EventRec>('PATCH', `/events/${id}`, b),
  deleteEvent: (id: string) => req<void>('DELETE', `/events/${id}`),

  // ----- forms -----
  listForms: (eventId: string) => req<FormDef[]>('GET', `/events/${eventId}/forms`),
  createForm: (eventId: string, b: Partial<FormDef>) => req<FormDef>('POST', `/events/${eventId}/forms`, b),
  getForm: (formId: string) => req<FormDef>('GET', `/forms/${formId}`),
  updateForm: (formId: string, b: Partial<FormDef>) => req<FormDef>('PATCH', `/forms/${formId}`, b),
  publicForm: (formId: string) => req<PublicForm>('GET', `/public/forms/${formId}`),
  submitForm: (
    formId: string,
    b: { speaker: { email: string; name: string; bio?: string }; answers: Record<string, unknown> },
  ) => req<{ submission_id: string; speaker_id: string; magic_token?: string }>(
    'POST', `/public/forms/${formId}/submit`, b),

  // ----- submissions -----
  listSubmissions: (eventId: string, q: { status?: string; track?: string; q?: string } = {}) => {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])
    const qs = s.toString()
    return req<Submission[]>('GET', `/events/${eventId}/submissions${qs ? `?${qs}` : ''}`)
  },
  updateSubmission: (id: string, b: { status?: SubmissionStatus; track?: string; category?: string }) =>
    req<Submission>('PATCH', `/submissions/${id}`, b),

  // ----- speaker portal -----
  portalMe: () => req<PortalMe>('GET', '/portal/me'),
  portalUpdate: (b: { name?: string; bio?: string; tagline?: string; company?: string; links_json?: string }) =>
    req<PortalMe>('PATCH', '/portal/me', b),
  portalUpload: (kind: Asset['kind'], file: File) => {
    const fd = new FormData()
    fd.set('kind', kind)
    fd.set('file', file)
    return req<Asset>('POST', '/portal/assets', undefined, fd)
  },
  portalDeleteAsset: (assetId: string) => req<void>('DELETE', `/portal/assets/${assetId}`),
  portalTaskDone: (taskKey: string) => req<PortalMe>('POST', `/portal/tasks/${taskKey}/done`),

  // ----- reviews -----
  listRounds: (eventId: string) => req<ReviewRound[]>('GET', `/events/${eventId}/rounds`),
  createRound: (eventId: string, b: Partial<ReviewRound>) =>
    req<ReviewRound>('POST', `/events/${eventId}/rounds`, b),
  updateRound: (roundId: string, b: Partial<ReviewRound>) => req<ReviewRound>('PATCH', `/rounds/${roundId}`, b),
  reviewQueue: (roundId: string) => req<QueueItem[]>('GET', `/rounds/${roundId}/queue`),
  submitReview: (roundId: string, sid: string, b: { scores_json: Record<string, number>; comment: string }) =>
    req<Review>('POST', `/rounds/${roundId}/submissions/${sid}/review`, b),
  aiReview: (roundId: string, sid: string) =>
    req<Review>('POST', `/rounds/${roundId}/submissions/${sid}/ai-review`),
  leaderboard: (eventId: string, round?: string) =>
    req<LeaderboardRow[]>('GET', `/events/${eventId}/leaderboard${round ? `?round=${round}` : ''}`),

  // ----- schedule -----
  listRooms: (eventId: string) => req<Room[]>('GET', `/events/${eventId}/rooms`),
  createRoom: (eventId: string, b: Partial<Room>) => req<Room>('POST', `/events/${eventId}/rooms`, b),
  listTracks: (eventId: string) => req<Track[]>('GET', `/events/${eventId}/tracks`),
  createTrack: (eventId: string, b: Partial<Track>) => req<Track>('POST', `/events/${eventId}/tracks`, b),
  schedule: (eventId: string) => req<ScheduleResponse>('GET', `/events/${eventId}/schedule`),
  createSlot: (eventId: string, b: Partial<ScheduleSlot>) =>
    req<{ slot: ScheduleSlot; conflicts: Conflict[] }>('POST', `/events/${eventId}/schedule/slots`, b),
  updateSlot: (slotId: string, b: Partial<ScheduleSlot>) =>
    req<{ slot: ScheduleSlot; conflicts: Conflict[] }>('PATCH', `/slots/${slotId}`, b),
  deleteSlot: (slotId: string) => req<{ conflicts: Conflict[] }>('DELETE', `/slots/${slotId}`),

  // ----- comms -----
  listTemplates: (eventId: string) => req<EmailTemplate[]>('GET', `/events/${eventId}/templates`),
  createTemplate: (eventId: string, b: Partial<EmailTemplate>) =>
    req<EmailTemplate>('POST', `/events/${eventId}/templates`, b),
  updateTemplate: (id: string, b: Partial<EmailTemplate>) => req<EmailTemplate>('PATCH', `/templates/${id}`, b),
  sendEmails: (
    eventId: string,
    b: { template_key: string; speaker_ids?: string[]; filter?: Record<string, string>; include_ics?: boolean },
  ) => req<SendResult>('POST', `/events/${eventId}/send`, b),
  emailLog: (eventId: string) => req<EmailLogRow[]>('GET', `/events/${eventId}/emails`),

  // ----- dashboard -----
  dashboard: (eventId: string) => req<DashboardData>('GET', `/events/${eventId}/dashboard`),

  // ----- resources -----
  listResources: (eventId: string) => req<Resource[]>('GET', `/events/${eventId}/resources`),
  createResource: (eventId: string, b: Partial<Resource>) =>
    req<Resource>('POST', `/events/${eventId}/resources`, b),
  getResource: (id: string) => req<Resource>('GET', `/resources/${id}`),
  updateResource: (id: string, b: Partial<Resource>) => req<Resource>('PATCH', `/resources/${id}`, b),
  deleteResource: (id: string) => req<void>('DELETE', `/resources/${id}`),
  publicResources: (slug: string) => req<Resource[]>('GET', `/public/events/${slug}/resources`),
  publicResource: (slug: string, rslug: string) =>
    req<Resource>('GET', `/public/events/${slug}/resources/${rslug}`),

  // ----- public embeds -----
  publicSpeakers: (slug: string) => req<PublicSpeakersResponse>('GET', `/public/events/${slug}/speakers`),
  publicSchedule: (slug: string) => req<PublicScheduleResponse>('GET', `/public/events/${slug}/schedule`),

  // ----- integrations -----
  getIntegration: (eventId: string, kind: string) =>
    req<Integration>('GET', `/events/${eventId}/integrations/${kind}`),
  putIntegration: (eventId: string, kind: string, config: Record<string, unknown>) =>
    req<Integration>('PUT', `/events/${eventId}/integrations/${kind}`, { config }),
  syncIntegration: (eventId: string, kind: string) =>
    req<SyncResult>('POST', `/events/${eventId}/integrations/${kind}/sync`),
}

/** URL for streaming an asset (headshots are public). */
export function assetUrl(assetId: string | null | undefined): string | null {
  return assetId ? `/api/assets/${assetId}` : null
}

/** Speaker ICS feed URL. */
export function icsUrl(speakerId: string, token: string) {
  return `/api/public/ics/${speakerId}.ics?token=${encodeURIComponent(token)}`
}
