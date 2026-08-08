# db/ — GreenRoom schema, migrations & seed

## Apply locally (wrangler, from repo root)

```sh
# migrations (creates .wrangler/state local sqlite)
wrangler d1 migrations apply greenroom-db --local
# demo data (safe to re-run; it clears and reloads)
wrangler d1 execute greenroom-db --local --file=db/seed.sql
```

## Apply remotely (staging D1 — maintainer runs this)

```sh
wrangler d1 migrations apply greenroom-db --remote
wrangler d1 execute greenroom-db --remote --file=db/seed.sql
```

Quick sanity check either way:

```sh
wrangler d1 execute greenroom-db --local \
  --command "SELECT status, COUNT(*) n FROM submissions GROUP BY status"
# expect: accepted 8 · in_review 3 · submitted 3 · rejected 2 · waitlisted 1 · withdrawn 1
```

No wrangler? The schema is plain SQLite: `sqlite3 dev.db < db/migrations/0001_init.sql && sqlite3 dev.db < db/seed.sql`.

## Data model

Everything hangs off **events** (one row per conference; all times are ISO-8601 UTC
strings, IDs are UUIDs). The CFP side: **forms** hold a `spec_json` describing fields —
including `showIf` conditional logic and category→track **routing** — and **submissions**
capture a speaker's answers plus a lifecycle `status` (submitted → in_review →
accepted/rejected/waitlisted/withdrawn). **speakers** are people (one per event+email),
authenticated by `magic_token` for the self-service portal; organizers/reviewers live in
**users** with cookie sessions in **sessions_auth**. Evaluation happens in
**review_rounds** (each with a `rubric_json`) and **reviews** (one per round × submission
× reviewer; AI-assisted reviews use `reviewer_id='ai'` and `ai=1`).

The program side: **rooms** and **tracks** partition the venue and the content, and
**schedule_slots** place accepted submissions (or title-only slots like breaks and
closings, via `kind`) into a room and time range — conflict detection (same room
overlapping, or same speaker overlapping) is computed by the API, not stored.
**email_templates** / **emails_log** drive templated speaker comms, **onboarding_tasks**
× **speaker_tasks** form the per-speaker checklist matrix behind the dashboard,
**resources** are wiki pages (optionally with `embed_html`, optionally public), **assets**
registers R2 uploads (headshots/slides/documents), and **integrations** holds per-event
Accelevents/Airtable sync config and last-sync status.

See `seed-notes.md` for the full fixed-UUID map of the demo dataset (DevConf 2026).
