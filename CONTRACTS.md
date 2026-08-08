# CONTRACTS — interface truth for GreenRoom

Owned by the coordinator. Backend implements exactly these routes; UI consumes exactly these;
data implements exactly this schema. Propose changes via SendMessage to the coordinator.

## D1 schema (v1)

```sql
-- events: a conference
events(id TEXT PK, name TEXT, slug TEXT UNIQUE, starts_on TEXT, ends_on TEXT, timezone TEXT,
       description TEXT, created_at TEXT)

-- users: organizers/reviewers
users(id TEXT PK, email TEXT UNIQUE, name TEXT, password_hash TEXT, role TEXT CHECK(role IN ('admin','reviewer')), created_at TEXT)

-- sessions_auth: organizer cookie sessions
sessions_auth(token TEXT PK, user_id TEXT FK, expires_at TEXT)

-- speakers: one row per speaker (person)
speakers(id TEXT PK, event_id TEXT FK, email TEXT, name TEXT, bio TEXT, tagline TEXT, company TEXT,
         headshot_key TEXT, links_json TEXT, magic_token TEXT, onboarding_json TEXT, created_at TEXT,
         UNIQUE(event_id, email))

-- forms: CFP form definitions (JSON field spec incl. conditional logic + category routing)
forms(id TEXT PK, event_id TEXT FK, name TEXT, is_open INTEGER, opens_at TEXT, closes_at TEXT,
      spec_json TEXT, created_at TEXT)
-- spec_json: { fields: [{id,type,label,required,options?,showIf?:{fieldId,op,value}}...],
--              routing: [{whenCategory: string, assignTrack: string}] }

-- submissions: CFP entries
submissions(id TEXT PK, event_id TEXT FK, form_id TEXT FK, speaker_id TEXT FK, title TEXT, abstract TEXT,
            category TEXT, track TEXT, answers_json TEXT,
            status TEXT CHECK(status IN ('submitted','in_review','accepted','rejected','waitlisted','withdrawn')),
            created_at TEXT)

-- review_rounds: evaluation rounds per event
review_rounds(id TEXT PK, event_id TEXT FK, name TEXT, round_no INTEGER, rubric_json TEXT, is_open INTEGER)

-- reviews: scores per submission per round per reviewer ('ai' reviewer_id for AI reviews)
reviews(id TEXT PK, round_id TEXT FK, submission_id TEXT FK, reviewer_id TEXT, scores_json TEXT,
        comment TEXT, ai INTEGER DEFAULT 0, created_at TEXT)

-- rooms / tracks
rooms(id TEXT PK, event_id TEXT FK, name TEXT, capacity INTEGER, sort INTEGER)
tracks(id TEXT PK, event_id TEXT FK, name TEXT, color TEXT, sort INTEGER)

-- schedule_slots: a scheduled talk (or break) — conflict detection = same room overlapping times,
-- or same speaker in overlapping slots
schedule_slots(id TEXT PK, event_id TEXT FK, submission_id TEXT FK NULL, room_id TEXT FK NULL,
               track_id TEXT FK NULL, title TEXT NULL, starts_at TEXT, ends_at TEXT, kind TEXT DEFAULT 'talk')

-- comms
email_templates(id TEXT PK, event_id TEXT FK, key TEXT, name TEXT, subject TEXT, body_md TEXT,
                UNIQUE(event_id, key))
emails_log(id TEXT PK, event_id TEXT FK, speaker_id TEXT FK, template_key TEXT, subject TEXT,
           status TEXT, provider TEXT, created_at TEXT)

-- speaker onboarding tasks (drives dashboard)
onboarding_tasks(id TEXT PK, event_id TEXT FK, key TEXT, label TEXT, due_at TEXT, required INTEGER,
                 UNIQUE(event_id, key))
speaker_tasks(id TEXT PK, speaker_id TEXT FK, task_key TEXT, done INTEGER, done_at TEXT,
              UNIQUE(speaker_id, task_key))

-- resources: wiki pages, html_embed allowed
resources(id TEXT PK, event_id TEXT FK, title TEXT, slug TEXT, body_md TEXT, embed_html TEXT,
          is_public INTEGER, sort INTEGER, updated_at TEXT)

-- assets: R2 file registry
assets(id TEXT PK, event_id TEXT FK, speaker_id TEXT FK NULL, submission_id TEXT FK NULL,
       kind TEXT CHECK(kind IN ('headshot','slides','document')), r2_key TEXT, filename TEXT,
       content_type TEXT, size INTEGER, created_at TEXT)

-- integrations: accelevents / airtable configs + sync log
integrations(id TEXT PK, event_id TEXT FK, kind TEXT CHECK(kind IN ('accelevents','airtable')),
             config_json TEXT, last_synced_at TEXT, last_status TEXT)
```

IDs: `crypto.randomUUID()`. Times: ISO-8601 UTC strings.

## API (Hono, base `/api`)

Auth: organizer routes require session cookie `gr_session`. Speaker routes require `?token=<magic_token>`
or `Authorization: Bearer <magic_token>`. Public routes are CORS-open GET.

### Auth
- `POST /api/auth/register` {email,name,password} → first user becomes admin; later registrations require admin invite (v1: admin-only creation)
- `POST /api/auth/login` {email,password} → sets cookie
- `POST /api/auth/logout`
- `GET  /api/auth/me` → {user}

### Events (organizer)
- `GET/POST /api/events` ; `GET/PATCH/DELETE /api/events/:eventId`

### Forms & submissions
- `GET/POST /api/events/:eventId/forms` ; `GET/PATCH /api/forms/:formId`
- `GET  /api/public/forms/:formId` → public form spec (no auth)
- `POST /api/public/forms/:formId/submit` {speaker:{email,name,bio?}, answers} → creates/updates speaker + submission, applies category routing, emails confirmation + magic link. Reserved answer ids (see Pinned decisions #1/#2): `title` (required), `abstract`, `category` are lifted from `answers` into the submission columns — the body stays exactly {speaker, answers}.
- `GET  /api/events/:eventId/submissions?status=&track=&q=` (organizer)
- `PATCH /api/submissions/:id` {status?, track?, category?} (organizer)

### Speaker portal (magic token)
- `GET   /api/portal/me` → speaker + submissions + tasks + assets
- `PATCH /api/portal/me` {bio,tagline,company,links_json,name}
- `POST  /api/portal/assets` (multipart: kind,file) → stores in R2, marks matching task done
- `DELETE /api/portal/assets/:assetId`
- `POST  /api/portal/tasks/:taskKey/done`

### Reviews
- `GET/POST /api/events/:eventId/rounds` ; `PATCH /api/rounds/:roundId`
- `GET  /api/rounds/:roundId/queue` → submissions + my existing review
- `POST /api/rounds/:roundId/submissions/:sid/review` {scores_json, comment}
- `POST /api/rounds/:roundId/submissions/:sid/ai-review` → runs AIReviewer, stores review with ai=1
- `GET  /api/events/:eventId/leaderboard?round=<roundId>` → aggregated scores; response shape pinned in Pinned decisions #3

### Schedule
- `GET/POST /api/events/:eventId/rooms` ; same for `/tracks`
- `GET  /api/events/:eventId/schedule` → slots + conflicts[]
- `POST /api/events/:eventId/schedule/slots` ; `PATCH/DELETE /api/slots/:slotId`
- Conflict rule (server-computed, returned on every schedule GET/mutation):
  overlap in same room, or same speaker in overlapping slots → `{slotIds, reason}`

### Comms
- `GET/POST /api/events/:eventId/templates` ; `PATCH /api/templates/:id`
- `POST /api/events/:eventId/send` {template_key, speaker_ids|filter, include_ics?} → renders Markdown + `{{name}}`-style vars, sends, logs
- `GET  /api/events/:eventId/emails` → log
- ICS: `GET /api/public/ics/:speakerId.ics?token=` → speaker's accepted+scheduled talks as VEVENTs

### Dashboard
- `GET /api/events/:eventId/dashboard` → per-speaker onboarding status matrix + counts + overdue

### Resources
- `GET/POST /api/events/:eventId/resources` ; `GET/PATCH/DELETE /api/resources/:id`
- `GET /api/public/events/:slug/resources` + `/resources/:rslug` (public ones only)

### Public embeds (CORS-open, cache 60s)
- `GET /api/public/events/:slug/speakers` → confirmed speakers (name, tagline, company, bio, headshot URL)
- `GET /api/public/events/:slug/schedule` → scheduled talks grouped by day/room/track
- Pages: `/embed/speakers/:slug`, `/embed/schedule/:slug` (self-contained, mobile-first, iframe-safe)

### Integrations
- `GET/PUT /api/events/:eventId/integrations/:kind` (config; secrets write-only)
- `POST /api/events/:eventId/integrations/:kind/sync` → one-way push, returns summary; logs to integrations

### Assets
- `GET /api/assets/:assetId` → streams from R2 (public for headshots, token/organizer for others)

## Pinned decisions (coordinator, 2026-08-08)

1. **Category derivation on CFP submit.** `submissions.category` = the value in `answers` for the
   field whose `id` is exactly `'category'`; NULL if the form has no such field or the answer is
   empty. Routing then applies the FIRST rule in `spec_json.routing` where `whenCategory` equals
   that value (case-sensitive exact match) and sets `submissions.track` to `assignTrack`.
   `assignTrack` / `submissions.track` hold the track **name** (denormalized string, not track id);
   organizers may overwrite via `PATCH /api/submissions/:id`.

2. **Title/abstract on CFP submit.** The public submit body stays exactly `{speaker, answers}` —
   no top-level `title`. The server lifts reserved answer ids into columns:
   `answers['title']` → `submissions.title` (400 `{"error":"title required"}` if missing/empty),
   `answers['abstract']` → `submissions.abstract` (nullable), `answers['category']` → per pin #1.
   Form builders must include a field with id `'title'` in every CFP form.

3. **Leaderboard response shape.**
   `GET /api/events/:eventId/leaderboard?round=<roundId>` →
   `{ round_id, rows: [{ submission_id, title, category, track, speaker_name,
      review_count, ai_review_count, score }] }`
   - per-review total = sum of the numeric values in that review's `scores_json`
   - `score` = mean of per-review totals across ALL reviews in the round (AI reviews included;
     `ai_review_count` lets the UI qualify), rounded to 2 decimals; `null` when `review_count` is 0
   - rows sorted `score` DESC with nulls last, tie-break `title` ASC.

4. **Response-object conventions (confirming QA's assumptions).** Organizer create/read responses
   return the full row with `id` at top level. Organizer submissions list rows include joined
   `speaker_id`, `speaker_name`, `speaker_email`.

## Bindings (wrangler.toml names — maintainer owns file, these names are fixed)
- D1: `DB` (database `greenroom-db`)
- R2: `FILES` (bucket `greenroom-files`)
- Vars/secrets: `RESEND_API_KEY?`, `ANTHROPIC_API_KEY?`, `APP_BASE_URL`
