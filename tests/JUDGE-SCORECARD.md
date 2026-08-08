# GreenRoom — Judge Simulation Scorecard

Walked as a skeptical judge against staging (`https://greenroom-dev.pages.dev`,
event `devconf-2026`). Statuses: ✅ verified · 🟡 works with rough edge (finding filed)
· 🔶 pending browser-level walk · ⛔ gap (finding filed). HTTP pass 1: 2026-08-08.
Per operator directive, core product quality is scored first; bonus rubric sits at the bottom.

## The 9 required features

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | CFP forms: custom forms, conditional logic, category routing | ✅ | `POST /api/public/forms/3333…3301/submit` → 201; spec has `showIf` fields; category "AI & ML" auto-routed to track "AI & Data". Phone-viewport form walk: 🔶 |
| 2 | Speaker portal: bios, headshots, slides, documents | 🟡 | `GET /api/portal/me?token=…` → speaker+submissions+4/4 tasks+assets; live upload/delete round-trip green in integration suite. **Finding: seeded asset objects 404 (broken gallery images) — filed to data.** Magic-link arrival on staging: **systemic finding to coordinator (console provider = no real email).** |
| 3 | Communications: templated emails, reminders, calendar invites | 🟡 | `POST /api/events/…/send` → `{requested:1,sent:1,failed:0}`, logged provider/status; `{{name}}` rendering verified in suite; ICS RFC-clean (CRLF, VERSION, PRODID, UID, DTSTAMP, balanced VEVENTs, `text/calendar`). **Finding: no Gmail/Outlook links ({{gcal_link}}/{{outlook_link}}) — filed to backend.** |
| 4 | Evaluation workflows: scoring, multiple rounds, AI-assisted | ✅ (AI: pending key) | Two seeded rounds (Round 1 closed w/ 13 scored rows, Round 2 open); judge review on open round → 200, leaderboard row `score:5, review_count:1` (exact mean math). AI review degrades correctly: 501 `ai_not_configured`. |
| 5 | Scheduling: drag-and-drop builder, automatic conflict detection | ✅ API / 🔶 UI | Forced same-room overlap → `{"slotIds":[…],"reason":"Overlapping slots in room \"Main Hall\""}`; non-overlap & touching-boundary negatives green in suite; mutation reverted cleanly. Drag UX + list/day/week/track/room views: browser pass pending. |
| 6 | Dashboard: real-time onboarding task tracking | ✅ | `GET /api/events/…/dashboard` → per-speaker matrix incl. Priya 4/4 + counts. |
| 7 | Accelevents integration: one-way sync, graceful without key | ✅ | `POST …/integrations/accelevents/sync` → `{ok:true,skipped:true,reason:"not configured: no API key set",pushed:0}` — graceful, honest, logged. |
| 8 | Resource pages: wiki + HTML embed capability | ✅ | Public list + `venue-av` page carries `embed_html`; private `pc-handbook` correctly invisible on public routes. |
| 9 | Public embeds: mobile-friendly gallery + schedule embeds | 🟡 | Both `/embed/*` pages: server-rendered, zero `<script>`, 7.1/9.0 KB, `max-age=60`, CORS-open JSON APIs. **Broken headshot images (finding #1) hit this surface hardest.** iframe harness + phone rendering: 🔶 |

## Brief-language line items (added per coordinator)

| Item | Status | Evidence |
|---|---|---|
| Scheduler offers list/day/week/track/room views | 🔶 | UI surface — browser pass pending |
| Comms calendar integration: Gmail + Outlook + iCal | ⛔ iCal-only | `{{ics_url}}` exists and ICS validates; Gmail/Outlook links absent (filed to backend) |

## Subjective practicality ("would we actually use/buy this")

- API design: consistent envelopes, discoverable errors (`invalid_body` names allowed keys), graceful degradation everywhere probed — reads production-grade.
- Latency: 58–65ms medians on public surfaces — feels instant.
- Danger zone for the "buy" question: broken images on the gallery embed and the
  magic-link dead-end are exactly the kind of first-five-minutes flaws a buying
  evaluator holds against a product. Both filed; both fixable cheaply.
- Browser-side feel (forms on a phone, drag scheduling): not yet scored — pass 2.

## Bonus rubric (bottom-weighted per operator directive)

| Bonus | Status |
|---|---|
| Cloudflare deployment | ✅ live (Pages + D1) |
| Speed/performance | ✅ evidenced (latency gate, 81.5 KB gzip bundle vs 150 KB budget) |
| API development | 🔶 openapi.json + /api/docs in flight elsewhere; not judge-walked yet |
| Airtable persistence | ⏸ needs operator key; graceful no-op verified |
| Forge hosting | skipped per coordinator |

## Findings ledger

1. **Seeded asset objects 404** → broken images on gallery embed. Owner: data. Filed 2026-08-08.
2. **Gmail/Outlook calendar links missing** (iCal only). Owner: backend. Filed 2026-08-08.
3. **Magic-link email dead-end on staging** (console provider — a real judge's CFP submission never delivers the portal link). Owner: coordinator decision (RESEND key vs. confirmation-screen link vs. both). Filed 2026-08-08.
