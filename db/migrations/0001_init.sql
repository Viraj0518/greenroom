-- GreenRoom D1 schema v1 — implements CONTRACTS.md verbatim.
-- Apply: wrangler d1 migrations apply greenroom-db --local   (or --remote)

-- events: a conference
CREATE TABLE events (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  starts_on   TEXT,
  ends_on     TEXT,
  timezone    TEXT,
  description TEXT,
  created_at  TEXT
);

-- users: organizers/reviewers
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT,
  role          TEXT CHECK (role IN ('admin','reviewer')),
  created_at    TEXT
);

-- sessions_auth: organizer cookie sessions
CREATE TABLE sessions_auth (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_auth_expires ON sessions_auth(expires_at);
CREATE INDEX idx_sessions_auth_user    ON sessions_auth(user_id);

-- speakers: one row per speaker (person)
CREATE TABLE speakers (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events(id),
  email           TEXT NOT NULL,
  name            TEXT,
  bio             TEXT,
  tagline         TEXT,
  company         TEXT,
  headshot_key    TEXT,
  links_json      TEXT,
  magic_token     TEXT,
  onboarding_json TEXT,
  created_at      TEXT,
  UNIQUE (event_id, email)
);
CREATE INDEX idx_speakers_event               ON speakers(event_id);
CREATE UNIQUE INDEX idx_speakers_magic_token  ON speakers(magic_token);

-- forms: CFP form definitions (JSON field spec incl. conditional logic + category routing)
CREATE TABLE forms (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id),
  name       TEXT,
  is_open    INTEGER,
  opens_at   TEXT,
  closes_at  TEXT,
  spec_json  TEXT,
  created_at TEXT
);
CREATE INDEX idx_forms_event ON forms(event_id);

-- submissions: CFP entries
CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id),
  form_id      TEXT REFERENCES forms(id),
  speaker_id   TEXT NOT NULL REFERENCES speakers(id),
  title        TEXT,
  abstract     TEXT,
  category     TEXT,
  track        TEXT,
  answers_json TEXT,
  status       TEXT CHECK (status IN ('submitted','in_review','accepted','rejected','waitlisted','withdrawn')),
  created_at   TEXT
);
CREATE INDEX idx_submissions_event_status ON submissions(event_id, status);
CREATE INDEX idx_submissions_status       ON submissions(status);
CREATE INDEX idx_submissions_speaker      ON submissions(speaker_id);
CREATE INDEX idx_submissions_form         ON submissions(form_id);

-- review_rounds: evaluation rounds per event
CREATE TABLE review_rounds (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id),
  name        TEXT,
  round_no    INTEGER,
  rubric_json TEXT,
  is_open     INTEGER
);
CREATE INDEX idx_review_rounds_event ON review_rounds(event_id);

-- reviews: scores per submission per round per reviewer ('ai' reviewer_id for AI reviews)
CREATE TABLE reviews (
  id            TEXT PRIMARY KEY,
  round_id      TEXT NOT NULL REFERENCES review_rounds(id),
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  reviewer_id   TEXT,
  scores_json   TEXT,
  comment       TEXT,
  ai            INTEGER DEFAULT 0,
  created_at    TEXT
);
CREATE INDEX idx_reviews_submission ON reviews(submission_id);
CREATE UNIQUE INDEX idx_reviews_one_per_reviewer ON reviews(round_id, submission_id, reviewer_id);

-- rooms / tracks
CREATE TABLE rooms (
  id       TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  name     TEXT,
  capacity INTEGER,
  sort     INTEGER
);
CREATE INDEX idx_rooms_event ON rooms(event_id);

CREATE TABLE tracks (
  id       TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  name     TEXT,
  color    TEXT,
  sort     INTEGER
);
CREATE INDEX idx_tracks_event ON tracks(event_id);

-- schedule_slots: a scheduled talk (or break) — conflict detection = same room overlapping times,
-- or same speaker in overlapping slots
CREATE TABLE schedule_slots (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id),
  submission_id TEXT REFERENCES submissions(id),
  room_id       TEXT REFERENCES rooms(id),
  track_id      TEXT REFERENCES tracks(id),
  title         TEXT,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  kind          TEXT DEFAULT 'talk'
);
CREATE INDEX idx_slots_event_start ON schedule_slots(event_id, starts_at);
CREATE INDEX idx_slots_room_start  ON schedule_slots(room_id, starts_at);
CREATE INDEX idx_slots_submission  ON schedule_slots(submission_id);

-- comms
CREATE TABLE email_templates (
  id       TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  key      TEXT NOT NULL,
  name     TEXT,
  subject  TEXT,
  body_md  TEXT,
  UNIQUE (event_id, key)
);

CREATE TABLE emails_log (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id),
  speaker_id   TEXT REFERENCES speakers(id),
  template_key TEXT,
  subject      TEXT,
  status       TEXT,
  provider     TEXT,
  created_at   TEXT
);
CREATE INDEX idx_emails_log_event_created ON emails_log(event_id, created_at);
CREATE INDEX idx_emails_log_speaker       ON emails_log(speaker_id);

-- speaker onboarding tasks (drives dashboard)
CREATE TABLE onboarding_tasks (
  id       TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  key      TEXT NOT NULL,
  label    TEXT,
  due_at   TEXT,
  required INTEGER,
  UNIQUE (event_id, key)
);

CREATE TABLE speaker_tasks (
  id         TEXT PRIMARY KEY,
  speaker_id TEXT NOT NULL REFERENCES speakers(id),
  task_key   TEXT NOT NULL,
  done       INTEGER,
  done_at    TEXT,
  UNIQUE (speaker_id, task_key)
);

-- resources: wiki pages, html_embed allowed
CREATE TABLE resources (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id),
  title      TEXT,
  slug       TEXT NOT NULL,
  body_md    TEXT,
  embed_html TEXT,
  is_public  INTEGER,
  sort       INTEGER,
  updated_at TEXT,
  UNIQUE (event_id, slug)
);
CREATE INDEX idx_resources_event ON resources(event_id);

-- assets: R2 file registry
CREATE TABLE assets (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES events(id),
  speaker_id    TEXT REFERENCES speakers(id),
  submission_id TEXT REFERENCES submissions(id),
  kind          TEXT CHECK (kind IN ('headshot','slides','document')),
  r2_key        TEXT,
  filename      TEXT,
  content_type  TEXT,
  size          INTEGER,
  created_at    TEXT
);
CREATE INDEX idx_assets_event      ON assets(event_id);
CREATE INDEX idx_assets_speaker    ON assets(speaker_id);
CREATE INDEX idx_assets_submission ON assets(submission_id);

-- integrations: accelevents / airtable configs + sync log
CREATE TABLE integrations (
  id             TEXT PRIMARY KEY,
  event_id       TEXT NOT NULL REFERENCES events(id),
  kind           TEXT CHECK (kind IN ('accelevents','airtable')),
  config_json    TEXT,
  last_synced_at TEXT,
  last_status    TEXT,
  UNIQUE (event_id, kind)
);
