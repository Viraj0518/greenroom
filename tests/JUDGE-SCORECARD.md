# GreenRoom — Judge Simulation Scorecard

Walked as a skeptical judge against staging (`https://greenroom-dev.pages.dev`,
event `devconf-2026`). Statuses: ✅ verified · 🟡 rough edge (filed) · ⛔ gap.
Full pass (HTTP **and** browser, every surface screenshotted, zero console errors
across the entire sweep): 2026-08-08 on deploys `2c05cdb` → `ce89068` (parity batch 1).
Per operator directive, core product quality first; bonuses at the bottom.

## The 9 required features — ALL VERIFIED

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | CFP forms: custom, conditional logic, category routing | ✅ | Browser: `/f/form_cfp` renders sectioned form; choosing "Workshop" **reveals the conditional Workshop-duration field live**; submit → "Proposal received! 🎉" with portal button (pin #8). API: routing verified, exact title-400 envelope, spec-driven validation. |
| 2 | Speaker portal: bios, headshots, slides, documents | ✅ | Browser: new-speaker portal (0/4 checklist w/ due dates) AND Priya's (tabbed Home/Sessions/Profile/Tasks/Files/Resources, real files w/ sizes, per-talk status chips). Live Supabase upload/delete round-trip green in suite. |
| 3 | Communications: templates, reminders, calendar invites | ✅ | Browser: template editor with sample-var live preview (Google · Outlook · iCal links render). Rendered-send tests: exact gcal/outlook prefixes for scheduled speakers, whole-line drop for unscheduled, `"]()"` never appears. ICS RFC-clean. |
| 4 | Evaluation: scoring, multiple rounds, AI-assisted | ✅ | Browser: review queue w/ rubric buttons, round-progress header, "Run AI review". API: **live Workers AI review 200 with real scores**; exact leaderboard math incl. upsert-per-reviewer, score=null sort. |
| 5 | Scheduling: drag-and-drop builder, conflict detection | ✅ | Browser: **all 5 views (List/Day/Week/By track/By room)**, dragged a talk from tray onto the Day grid (Unscheduled 2→1), forced overlap → red banner "1 conflict: Overlapping slots in room Main Hall" + both cards flagged + per-conflict Show jump. Negatives (non-overlap, touching) green in suite. |
| 6 | Dashboard: real-time onboarding tracking | ✅ | Browser: stat tiles, submission-pipeline funnel, accepted-by-track, per-speaker matrix w/ due dates. |
| 7 | Accelevents integration: one-way sync, graceful keyless | ✅ | Settings page w/ "not configured" badge + write-only hint; sync → `{ok:true,skipped:true,reason:"not configured…"}`. Secrets structurally masked (smuggle-proof, verified). |
| 8 | Resource pages: wiki + HTML embed | ✅ | Browser: editor w/ private badge; public routes filter is_public; venue-av carries embed_html; portal now shows public wiki pages in-portal. |
| 9 | Public embeds: mobile-friendly gallery + schedule | ✅ | Server-rendered, **zero `<script>`**, 7.1/9.0 KB, 60s cache, CORS-open, 8/8 real headshots (smoke-asserted). **iframe harness: both embeds load in a third-party page** (resource-timing verified; headers carry no XFO/CSP frame blocks). |

## Brief-language line items

| Item | Status |
|---|---|
| Scheduler list/day/week/track/room views | ✅ all 5 present and rendering |
| Comms calendar integration Gmail + Outlook + iCal | ✅ template vars + portal buttons + ICS, all live |
| Judge entry points (landing creds + form_cfp) | ✅ work live; permanently smoke-pinned |
| Sessionboard structural parity | ✅ batch 1 audited clean (funnel dashboard, tabbed portal, round headers, conflict jumps, var preview) |
| Verbatim Sessionboard copy policing | ✅ none observed in any walked surface (copy is original throughout) |

## Subjective practicality ("would we actually use/buy this")

The full judge loop — land → submit CFP (conditional fields work) → get portal link on
screen → complete onboarding → organizer triages/scores/schedules with live conflict
feedback → public embeds + calendar links — **works end to end with zero console
errors and 58–80ms API medians**. Empty states are thoughtful ("All accepted talks
are scheduled 🎉"), copy is original, dark theme is coherent. This now earns a "yes"
on every surface walked.

## Bonus rubric (bottom-weighted)

| Bonus | Status |
|---|---|
| Cloudflare deployment | ✅ Pages + D1 + Workers AI live |
| Speed/performance | ✅ latency gate + 84.1 KB gzip vs 150 KB budget (CI-gated) |
| API development | 🔶 openapi.json + /api/docs in flight elsewhere |
| Airtable persistence | ⏸ graceful no-op verified; needs operator key |
| Forge hosting | skipped per coordinator |

## Findings ledger — all closed

| # | Finding | Resolution |
|---|---|---|
| 1 | Seeded asset objects 404 (broken gallery) | 8/8 real images live; smoke-asserted |
| 2 | Gmail/Outlook links missing | live in templates + portal; render-behavior tests green |
| 3 | Magic-link dead-end | pin #8 portal_url + confirmation screen, verified in browser |
| 4–5 | Landing CTA + tour creds drift | seed adopted UI's promises; smoke-pinned |
| 6 | UI fatal-render class (3 pages, no boundary) | root-caused (mock-vs-envelope) + fixed; envelope contract tests green; error boundary shipped |

## Known-cosmetic / stated limitations (coordinator-dispositioned, not blockers)

- **Lazy `mocks-*.js` chunk (26.8 kB) in the production build** — never loaded on any
  walked prod page; deliberately frozen rather than fixed during pencils-down.
- **Narrow-width verification floor ~500px CSS** (Chrome minimum window width in the
  harness) — true phone-width rendering untested; accepted risk, restated in the GO/NO-GO.
  Form/embeds use fluid layouts, so exposure is low.

## Final-gate acceptance checks (cycle-3 ReviewPage fixes — pre-specified by QA)

The last gate before freeze verifies these against the deployed candidate, in the
browser, in addition to the full standing protocol (quiesced suite, content-hash
identity, origin scan, RO smoke, overflow probe, console reads):

1. **Review progress label**: the round-header bar either reads "…% reviewed **by
   you**" (per-user, labeled honestly) or shows round-wide coverage as a distinct
   metric — no per-user number wearing a round-wide label anywhere on the page.
2. **Closed-round scoring**: with a closed round selected, score buttons and Save
   are disabled and a "round closed — scores are final" notice is visible; no path
   to the server's 400 `round_closed` from normal UI use.
3. **(If included) round selector default**: defaults to the first OPEN round when
   one exists, not to a closed round.

## Remaining before GO (process, not product)

1. UI pencils-down after this clean pass → candidate sequence: final destructive pass →
   maintainer re-seed (+ remote D1 tuple probes) → cut → gate.
2. Gate legs: local quiesced-checkout full suite (mutations) + staging `--read-only`
   smoke (curated-count freshness — currently correctly RED on residue until re-seed).
3. Test residue: submissions junk withdrawn (queues verified clean); residual speaker
   rows removed by the final re-seed.
