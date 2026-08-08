# GreenRoom — open-source Sessionboard alternative

Competition: "$10,000 Kill My SaaS" — build an open-source alternative to Sessionboard
(conference speaker & content management). **Deadline: Wednesday, August 12, 10 PM PT.**
Submission = open-source repo + deployed, testable site. Bonus points: Cloudflare
deployment, Airtable persistence, performance, API development.

## Required features (from the brief — all 9 must exist)

1. **CFP forms** — custom call-for-speakers submission forms with conditional logic and category-based routing
2. **Speaker portal** — self-service: bios, headshots, slides, supporting documents
3. **Communications** — automated, templated speaker emails incl. reminders and calendar invites (ICS delivered to the speaker's own calendar)
4. **Evaluation workflows** — submission scoring, multiple evaluation rounds, optional AI-assisted review
5. **Scheduling** — drag-and-drop schedule/agenda builder with automatic conflict detection across rooms and tracks
6. **Dashboard** — real-time task tracking of outstanding speaker onboarding requirements
7. **Accelevents integration** — one-way data sync (push our data to Accelevents; API-key config, graceful no-op without key)
8. **Resource pages** — wiki/reference pages with HTML embed capability
9. **Public embeds** — mobile-friendly speaker gallery + schedule embeds for external websites (iframe/script embed)

## Architecture (decided — do not relitigate; flag blockers to the coordinator)

- **Monorepo**, pnpm, TypeScript everywhere.
- **Frontend**: Vite + React 18 SPA in `app/`. React Router. No heavy UI kit — small, fast, clean CSS (own design system, dark/light aware). dnd-kit for drag-and-drop.
- **API**: Hono running on **Cloudflare Pages Functions** (`functions/api/[[route]].ts` single catch-all → Hono app in `functions/src/`).
- **DB**: **Cloudflare D1** (SQLite). Schema + migrations + seed in `db/`. Raw SQL via prepared statements (no ORM).
- **Files** (headshots/slides/docs): **R2** bucket, presigned-style upload via API.
- **Email**: provider interface in backend (`EmailProvider`); adapters: `console` (dev, logs the email), `resend` (if RESEND_API_KEY set). ICS files generated server-side and attached/linked.
- **AI review** (optional feature): `AIReviewer` interface; adapter for Anthropic API (ANTHROPIC_API_KEY) — model `claude-sonnet-5`; graceful "not configured" state without key.
- **Auth**: organizers = email+password session (cookie, hashed pw); speakers = magic-link tokens (no password). Single-tenant per deployment, multiple events supported.
- **Embeds**: public JSON API + tiny embed pages (`/embed/speakers/:eventId`, `/embed/schedule/:eventId`) designed for iframing; CORS-open read-only endpoints.
- **Airtable (bonus)**: optional one-way mirror sync like Accelevents, same "integration" pattern.
- **Staging**: Cloudflare Pages project `greenroom-dev` (D1 + R2 bindings), deployed via `wrangler pages deploy`.

## Team & directory ownership (hard boundaries — do not edit outside your area without coordinating)

| Role | Session | Owns |
|---|---|---|
| Coordinator | main session | PLAN.md, CONTRACTS.md, task board, arbitration |
| Data | tenzinyeshi-a4 | `db/` (schema, migrations, seed), D1/R2 binding names |
| Backend | tenzinyeshi-34 | `functions/` (Hono API, auth, email/ICS, AI, integrations) |
| UI/UX | tenzinyeshi-07 | `app/` (all frontend + embed pages + design system) |
| QA | tenzinyeshi-a9 | `tests/` (unit/integration/smoke), quality gate |
| Maintainer | tenzinyeshi-b7 | repo root (package.json, wrangler.toml, CI, README, LICENSE), git commits/merges, GitHub repo, Cloudflare deploys |

## Working rules

- **CONTRACTS.md is the interface truth** (API routes + DB schema). Change it only via the coordinator; announce every change to affected roles by SendMessage.
- All sessions work directly in `~/greenroom` on `main`. Stay inside your owned directories. Shared root config files belong to the maintainer — message them to add deps.
- **Maintainer commits on behalf of everyone** at meaningful checkpoints (at least every 1-2 hours of work) and pushes to GitHub.
- Announce meaningful state changes (done X, blocked on Y) to the coordinator (this main session) via SendMessage.
- MIT license. No proprietary code.
- **Design parity directive (operator, 2026-08-08): mirror Sessionboard's real UI as closely as
  possible — screen structure, navigation, layout patterns, dashboard composition — "even the
  dashboards".** Sources: sessionboard.com product pages/tour, public demo videos, G2/Capterra
  screenshots. Hard boundary: structural/workflow parity ONLY — never copy their verbatim text,
  icons, illustrations, images, CSS, or brand assets (infringement risk in an open-source repo);
  write equivalent original copy and keep GreenRoom branding.
- Milestone order: M1 skeleton boots locally (wrangler pages dev) → M2 CFP + portal + review end-to-end → M3 scheduler + comms + dashboard → M4 embeds + integrations + polish → M5 staged on Cloudflare + README + submission-ready.
