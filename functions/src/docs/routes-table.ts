// Single source of truth for the API description: /api/openapi.json and the
// server-rendered /api/docs page are both generated from this table.

export type AuthMode = 'public' | 'organizer' | 'admin' | 'speaker'

export interface RouteDoc {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  path: string // OpenAPI style, e.g. /api/events/{eventId}
  tag: string
  summary: string
  auth: AuthMode
  body?: Record<string, unknown> // example request body
  notes?: string
}

export const API_ROUTES: RouteDoc[] = [
  { method: 'get', path: '/api/health', tag: 'Meta', summary: 'Liveness check', auth: 'public' },
  { method: 'get', path: '/api/openapi.json', tag: 'Meta', summary: 'This API description (OpenAPI 3)', auth: 'public' },
  { method: 'get', path: '/api/docs', tag: 'Meta', summary: 'Human-readable API docs (server-rendered HTML)', auth: 'public' },

  { method: 'post', path: '/api/auth/register', tag: 'Auth', summary: 'Register a user — first user becomes admin; afterwards admin-only', auth: 'public', body: { email: 'org@example.com', name: 'Org Anizer', password: 'correct-horse' } },
  { method: 'post', path: '/api/auth/login', tag: 'Auth', summary: 'Log in; sets the gr_session cookie', auth: 'public', body: { email: 'org@example.com', password: 'correct-horse' } },
  { method: 'post', path: '/api/auth/logout', tag: 'Auth', summary: 'Destroy the current session', auth: 'public' },
  { method: 'get', path: '/api/auth/me', tag: 'Auth', summary: 'Current organizer user', auth: 'organizer' },

  { method: 'get', path: '/api/events', tag: 'Events', summary: 'List events', auth: 'organizer' },
  { method: 'post', path: '/api/events', tag: 'Events', summary: 'Create an event', auth: 'organizer', body: { name: 'DevConf 2026', slug: 'devconf-2026', timezone: 'UTC' } },
  { method: 'get', path: '/api/events/{eventId}', tag: 'Events', summary: 'Get an event', auth: 'organizer' },
  { method: 'patch', path: '/api/events/{eventId}', tag: 'Events', summary: 'Update an event', auth: 'organizer' },
  { method: 'delete', path: '/api/events/{eventId}', tag: 'Events', summary: 'Delete an event', auth: 'admin' },

  { method: 'get', path: '/api/events/{eventId}/forms', tag: 'CFP', summary: 'List CFP forms', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/forms', tag: 'CFP', summary: 'Create a CFP form (spec = fields with conditional showIf + category routing)', auth: 'organizer', body: { name: 'Call for Speakers', spec: { fields: [{ id: 'title', type: 'text', label: 'Talk title', required: true }], routing: [{ whenCategory: 'AI & ML', assignTrack: 'AI & Data' }] } } },
  { method: 'get', path: '/api/forms/{formId}', tag: 'CFP', summary: 'Get a form', auth: 'organizer' },
  { method: 'patch', path: '/api/forms/{formId}', tag: 'CFP', summary: 'Update a form', auth: 'organizer' },
  { method: 'get', path: '/api/public/forms/{formId}', tag: 'CFP', summary: 'Public form spec (for rendering the CFP page)', auth: 'public' },
  { method: 'post', path: '/api/public/forms/{formId}/submit', tag: 'CFP', summary: 'Submit a talk — upserts the speaker, applies category routing, emails a magic portal link', auth: 'public', body: { speaker: { email: 'jane@example.com', name: 'Jane Doe' }, answers: { title: 'My Talk', abstract: '…', category: 'AI & ML' } }, notes: "answers.title is required (400 {\"error\":\"title required\"})." },
  { method: 'get', path: '/api/events/{eventId}/submissions', tag: 'CFP', summary: 'List submissions (?status=&track=&q=)', auth: 'organizer' },
  { method: 'patch', path: '/api/submissions/{id}', tag: 'CFP', summary: 'Update submission status/track/category', auth: 'organizer', body: { status: 'accepted' } },

  { method: 'get', path: '/api/portal/me', tag: 'Speaker portal', summary: 'Speaker profile + submissions + onboarding tasks + assets', auth: 'speaker' },
  { method: 'patch', path: '/api/portal/me', tag: 'Speaker portal', summary: 'Update speaker profile', auth: 'speaker', body: { bio: '…', tagline: '…', company: '…' } },
  { method: 'post', path: '/api/portal/assets', tag: 'Speaker portal', summary: 'Upload headshot/slides/document (multipart: kind, file); auto-completes the matching onboarding task', auth: 'speaker' },
  { method: 'delete', path: '/api/portal/assets/{assetId}', tag: 'Speaker portal', summary: 'Delete an uploaded asset', auth: 'speaker' },
  { method: 'post', path: '/api/portal/tasks/{taskKey}/done', tag: 'Speaker portal', summary: 'Mark an onboarding task done', auth: 'speaker' },

  { method: 'get', path: '/api/events/{eventId}/rounds', tag: 'Reviews', summary: 'List review rounds', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/rounds', tag: 'Reviews', summary: 'Create a review round (optional rubric)', auth: 'organizer', body: { name: 'Round 1', rubric: { criteria: [{ key: 'relevance', label: 'Relevance', max: 5 }] } } },
  { method: 'patch', path: '/api/rounds/{roundId}', tag: 'Reviews', summary: 'Update a round', auth: 'organizer' },
  { method: 'get', path: '/api/rounds/{roundId}/queue', tag: 'Reviews', summary: 'Review queue with your existing review per submission', auth: 'organizer' },
  { method: 'post', path: '/api/rounds/{roundId}/submissions/{sid}/review', tag: 'Reviews', summary: 'Submit/replace your score for a submission', auth: 'organizer', body: { scores_json: { relevance: 4 }, comment: 'Solid fit.' } },
  { method: 'post', path: '/api/rounds/{roundId}/submissions/{sid}/ai-review', tag: 'Reviews', summary: 'AI-assisted review (Anthropic key → claude-sonnet-5, else Workers AI binding; 501 when neither is configured)', auth: 'organizer' },
  { method: 'get', path: '/api/events/{eventId}/leaderboard', tag: 'Reviews', summary: 'Score leaderboard (?round=), null scores sort last', auth: 'organizer' },

  { method: 'get', path: '/api/events/{eventId}/rooms', tag: 'Schedule', summary: 'List rooms', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/rooms', tag: 'Schedule', summary: 'Create a room', auth: 'organizer', body: { name: 'Main Hall', capacity: 300 } },
  { method: 'patch', path: '/api/rooms/{id}', tag: 'Schedule', summary: 'Update a room', auth: 'organizer' },
  { method: 'delete', path: '/api/rooms/{id}', tag: 'Schedule', summary: 'Delete a room (slots keep their times, lose the room)', auth: 'organizer' },
  { method: 'get', path: '/api/events/{eventId}/tracks', tag: 'Schedule', summary: 'List tracks', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/tracks', tag: 'Schedule', summary: 'Create a track', auth: 'organizer', body: { name: 'AI & Data', color: '#0a7d4f' } },
  { method: 'patch', path: '/api/tracks/{id}', tag: 'Schedule', summary: 'Update a track', auth: 'organizer' },
  { method: 'delete', path: '/api/tracks/{id}', tag: 'Schedule', summary: 'Delete a track', auth: 'organizer' },
  { method: 'get', path: '/api/events/{eventId}/schedule', tag: 'Schedule', summary: 'Slots + server-computed conflicts (same-room or same-speaker overlap)', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/schedule/slots', tag: 'Schedule', summary: 'Create a slot; response includes refreshed conflicts', auth: 'organizer', body: { submission_id: '…', room_id: '…', starts_at: '2026-10-06T16:00:00Z', ends_at: '2026-10-06T16:45:00Z' } },
  { method: 'patch', path: '/api/slots/{slotId}', tag: 'Schedule', summary: 'Move/update a slot; response includes refreshed conflicts', auth: 'organizer' },
  { method: 'delete', path: '/api/slots/{slotId}', tag: 'Schedule', summary: 'Delete a slot; response includes refreshed conflicts', auth: 'organizer' },

  { method: 'get', path: '/api/events/{eventId}/templates', tag: 'Comms', summary: 'List email templates', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/templates', tag: 'Comms', summary: 'Create a template (Markdown body, {{name}}-style vars)', auth: 'organizer', body: { key: 'accepted', name: 'Acceptance', subject: 'You are in, {{name}}!', body_md: 'See you at **{{event}}**.' } },
  { method: 'patch', path: '/api/templates/{id}', tag: 'Comms', summary: 'Update a template', auth: 'organizer' },
  { method: 'delete', path: '/api/templates/{id}', tag: 'Comms', summary: 'Delete a template', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/send', tag: 'Comms', summary: 'Batch-send a template to speakers (ids or status filter); optional ICS calendar attachment', auth: 'organizer', body: { template_key: 'accepted', filter: { status: 'accepted' }, include_ics: true } },
  { method: 'get', path: '/api/events/{eventId}/emails', tag: 'Comms', summary: 'Sent-email log', auth: 'organizer' },
  { method: 'get', path: '/api/public/ics/{speakerId}.ics', tag: 'Comms', summary: "Speaker's accepted+scheduled talks as a VCALENDAR (?token=)", auth: 'speaker' },

  { method: 'get', path: '/api/events/{eventId}/dashboard', tag: 'Dashboard', summary: 'Per-speaker onboarding matrix, counts, overdue tasks', auth: 'organizer' },

  { method: 'get', path: '/api/events/{eventId}/resources', tag: 'Resources', summary: 'List resource pages', auth: 'organizer' },
  { method: 'post', path: '/api/events/{eventId}/resources', tag: 'Resources', summary: 'Create a resource page (Markdown + optional HTML embed)', auth: 'organizer', body: { title: 'Speaker guide', body_md: '# Welcome', is_public: true } },
  { method: 'get', path: '/api/resources/{id}', tag: 'Resources', summary: 'Get a resource', auth: 'organizer' },
  { method: 'patch', path: '/api/resources/{id}', tag: 'Resources', summary: 'Update a resource', auth: 'organizer' },
  { method: 'delete', path: '/api/resources/{id}', tag: 'Resources', summary: 'Delete a resource', auth: 'organizer' },
  { method: 'get', path: '/api/public/events/{slug}/resources', tag: 'Resources', summary: 'Public resource index', auth: 'public' },
  { method: 'get', path: '/api/public/events/{slug}/resources/{rslug}', tag: 'Resources', summary: 'Public resource page', auth: 'public' },

  { method: 'get', path: '/api/public/events/{slug}/speakers', tag: 'Public & embeds', summary: 'Accepted speakers (JSON; CORS-open, cached 60s)', auth: 'public' },
  { method: 'get', path: '/api/public/events/{slug}/schedule', tag: 'Public & embeds', summary: 'Published schedule grouped by day (JSON; CORS-open, cached 60s)', auth: 'public' },
  { method: 'get', path: '/embed/speakers/{slug}', tag: 'Public & embeds', summary: 'Server-rendered speaker gallery (self-contained HTML, iframe-safe)', auth: 'public' },
  { method: 'get', path: '/embed/schedule/{slug}', tag: 'Public & embeds', summary: 'Server-rendered schedule (self-contained HTML, iframe-safe)', auth: 'public' },

  { method: 'get', path: '/api/events/{eventId}/integrations/{kind}', tag: 'Integrations', summary: 'Integration config (kind: accelevents|airtable; secrets never echoed)', auth: 'organizer' },
  { method: 'put', path: '/api/events/{eventId}/integrations/{kind}', tag: 'Integrations', summary: 'Set integration config; secret keys are write-only', auth: 'organizer', body: { config: { apiKey: 'sk-…', baseId: 'app…' } } },
  { method: 'post', path: '/api/events/{eventId}/integrations/{kind}/sync', tag: 'Integrations', summary: 'One-way push to the provider; graceful no-op summary when unconfigured', auth: 'organizer' },

  { method: 'get', path: '/api/assets/{assetId}', tag: 'Assets', summary: 'Stream a stored file (headshots public; others owner/organizer only)', auth: 'public' },
]
