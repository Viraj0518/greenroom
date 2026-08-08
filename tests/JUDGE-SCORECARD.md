# GreenRoom — Judge Simulation Scorecard

Walked as a skeptical judge against staging (`https://greenroom-dev.pages.dev`,
event `devconf-2026`). Statuses: ✅ verified · 🟡 works with rough edge (finding filed)
· 🔶 pending browser-level walk · ⛔ gap (finding filed). Last full pass: 2026-08-08
(HTTP pass on deploy `1a417f9`; browser pass blocked mid-way — see UI crash class).
Per operator directive, core product quality is scored first; bonuses at the bottom.

## Headline blocker

**UI fatal-render crash class** (filed to UI as one consolidated finding): DashboardPage
(`'id'`), FormPage (`'fields'`), SchedulePage (`'starts_on'`) all black-screen — pages deref
fetch results before they resolve, and there is no top-level error boundary. The CFP form
page a judge lands on IS one of the three. API-side everything beneath these screens is
verified working. UI is mid-rebuild (Sessionboard-parity directive) with both structural
fixes requested baked into the new scaffold. **No GO while any surface black-screens.**

## The 9 required features

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | CFP forms: custom forms, conditional logic, category routing | 🟡 API ✅ / UI ⛔ | `POST /api/public/forms/form_cfp/submit` → 201 pin-#8 shape `{ok, submission_id, portal_url, email_delivery}`; `showIf` conditional logic + category→track routing verified. **UI: /f/form_cfp black-screens (FormPage crash).** |
| 2 | Speaker portal: bios, headshots, slides, documents | ✅ API | portal/me: speaker+submissions+tasks+assets+`ics_url`+per-sub `slot/gcal_link/outlook_link`; live Supabase upload/delete round-trip green; submit now returns `portal_url` directly (pin #8 — fixes the magic-link dead-end). Browser walk of portal UI (incl. 1/4-onboarding speaker s06): 🔶 |
| 3 | Communications: templated emails, reminders, calendar invites | ✅ | Send → `{requested:1,sent:1,failed:0}` + log; `{{name}}` render verified; ICS RFC-clean (CRLF/VERSION/PRODID/UID/DTSTAMP, `text/calendar`); Gmail `render?action=TEMPLATE` + Outlook `deeplink/compose` links live in templates and portal (verified on Priya). |
| 4 | Evaluation workflows: scoring, multiple rounds, AI-assisted | ✅ | 2 seeded rounds (1 closed w/ 13 scored rows, 1 open, queue=10); judge review → exact leaderboard math (score 5 = 2+1+2, count 1); **live AI review 200** via Workers AI (real rubric scores + coherent comment, reviewer_id='ai'). |
| 5 | Scheduling: drag-and-drop builder, automatic conflict detection | 🟡 API ✅ / UI ⛔ | Forced same-room overlap → `{slotIds, reason:"Overlapping slots in room \"Main Hall\""}`; negatives green; cleanly reverted. **UI: /org/schedule black-screens (SchedulePage crash).** Drag UX + list/day/week/track/room views: 🔶 |
| 6 | Dashboard: real-time onboarding task tracking | 🟡 API ✅ / UI ⛔ | API: per-speaker matrix + counts (Priya 4/4). **UI: /org black-screens (DashboardPage crash) — even for unauthenticated visitors.** |
| 7 | Accelevents integration: one-way sync, graceful without key | ✅ | Sync → `{ok:true,skipped:true,reason:"not configured: no API key set",pushed:0}`; config schema-validated, secrets write-only (structural masking verified). |
| 8 | Resource pages: wiki + HTML embed capability | ✅ | Public list + `venue-av` carries embed_html; private `pc-handbook` invisible on public routes (positive+negative controls in smoke). |
| 9 | Public embeds: mobile-friendly gallery + schedule embeds | ✅ | Server-rendered, zero `<script>`, 7.1/9.0 KB, `max-age=60`, CORS-open; **8/8 gallery images now serve 200 image/\*** (smoke-asserted permanently). iframe harness + phone rendering: 🔶 |

## Brief-language line items

| Item | Status | Evidence |
|---|---|---|
| Scheduler list/day/week/track/room views | 🔶 blocked | behind SchedulePage crash; walk queued for UI's next deploy |
| Comms calendar integration: Gmail + Outlook + iCal | ✅ | all three links live (template vars + portal fields), exact emitted prefixes asserted |
| Judge entry points (landing-page creds + form_cfp URL) | ✅ pinned | permanent smoke assertions after both broke once (UI-hardcode vs seed drift) |
| Sessionboard structural parity + verbatim-copy policing | 🔶 | scheduled against UI's rebuilt surfaces |

## Subjective practicality ("would we actually use/buy this")

- API layer reads production-grade: consistent envelopes, self-describing errors,
  graceful degradation, 58–65ms medians, honest `email_delivery` signaling.
- Landing page + login screen look clean and confident; copy is original.
- **The black screens are currently the whole story for a buying evaluator** — three
  of the first surfaces a judge touches die silently. Everything else earns a "yes";
  this earns a "no" until fixed. Both structural fixes are with UI.

## Bonus rubric (bottom-weighted per operator directive)

| Bonus | Status |
|---|---|
| Cloudflare deployment | ✅ live (Pages + D1 + Workers AI) |
| Speed/performance | ✅ evidenced (latency gate, 81.5 KB gzip vs 150 KB budget) |
| API development | 🔶 openapi.json + /api/docs in flight elsewhere |
| Airtable persistence | ⏸ needs operator key; graceful no-op verified |
| Forge hosting | skipped per coordinator |

## Findings ledger

| # | Finding | Owner | Status |
|---|---|---|---|
| 1 | Seeded asset objects 404 → broken gallery images | data/maintainer | **RESOLVED** — 8/8 real images live, smoke-asserted |
| 2 | Gmail/Outlook calendar links missing | backend | **RESOLVED** — verified live |
| 3 | Magic-link email dead-end (console provider) | coordinator → pin #8 | **RESOLVED** — submit returns portal_url + email_delivery; RESEND key optional upgrade |
| 4 | "Submit a talk" CTA → nonexistent form id | data (seed moved) | **RESOLVED** — form_cfp live, smoke-pinned |
| 5 | Tour's printed demo creds 401 | data (seed moved) | **RESOLVED** — demo@greenroom.dev live, smoke-pinned |
| 6 | UI fatal-render crash class (3 pages) + no error boundary | UI | **OPEN** — blocks GO |
