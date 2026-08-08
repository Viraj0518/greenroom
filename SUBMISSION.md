# Submission packet — "$10,000 Kill My SaaS" (Sessionboard)

Everything the entry form needs. Target: **Wednesday Aug 12, before 10 PM PT.**
Submit ONLY after QA's explicit GO on the candidate sha (M5 gate).

## Form fields

| Field | Value |
|---|---|
| Project name | GreenRoom |
| Tagline | Open-source speaker & content management — a self-hostable Sessionboard alternative on Cloudflare |
| Repo (public, MIT) | https://github.com/Viraj0518/greenroom |
| Live testable site | https://greenroom-dev.pages.dev |
| SaaS being killed | Sessionboard (conference speaker & content management) |

## Test credentials for judges

| Role | How |
|---|---|
| Organizer (admin) | https://greenroom-dev.pages.dev/org/login — `demo@greenroom.dev` / `greenroom-demo` |
| Reviewer | `jordan.kim@example.com` / `demo-greenroom-2026` |
| Speaker portal | https://greenroom-dev.pages.dev/portal?token=mtok_s01_9f3a7c1e2b4d |
| Public CFP form | https://greenroom-dev.pages.dev/f/form_cfp |
| Embeds (iframe-ready) | /embed/speakers/devconf-2026 · /embed/schedule/devconf-2026 |

## Feature checklist (the brief's 9 + bonus)

- [x] 1. CFP forms — conditional logic (`showIf`) + category→track routing
- [x] 2. Speaker portal — magic-link, bios/headshots/slides/documents
- [x] 3. Communications — templated emails, reminders, ICS calendar invites
- [x] 4. Evaluation — multi-round scoring, rubrics, leaderboard, AI-assisted review
- [x] 5. Scheduling — drag-and-drop, automatic room/speaker conflict detection
- [x] 6. Dashboard — real-time speaker onboarding task tracking
- [x] 7. Accelevents — one-way sync, API-key config, graceful no-op
- [x] 8. Resource pages — wiki + sanitized HTML embeds
- [x] 9. Public embeds — mobile-friendly, script-free, iframe-safe
- [x] Bonus: Cloudflare-native (Pages/Functions/D1/Workers AI)
- [x] Bonus: REST API (~40 endpoints, documented in CONTRACTS.md)
- [x] Bonus: performance (68ms API medians, 3.4KB embeds, 81.5KB initial JS vs CI-enforced 150KB budget)
- [ ] Bonus: Airtable mirror (backend, if time allows)

## Talking points

- Every optional dependency degrades gracefully: storage (R2 → Supabase → clean error), email (Resend → console log), AI (Claude → Workers AI → "not configured"). The demo needs zero external secrets.
- Embeds are server-rendered from the edge: no JS, <30 KB, 60s cache — view-source proves it.
- Quality gates: 86-test integration suite + 15/15 deployment smoke + bundle budget in CI.
- Self-host = one Cloudflare account, three commands.

## Pre-submit checklist (maintainer)

- [ ] UI pencils-down received
- [ ] Candidate sha announced to QA (+ immutable deployment URL, Source verified)
- [ ] QA GO received ← **hard gate, no GO no submit**
- [ ] Final deploy == candidate sha; smoke 15/15 on the deployment URL
- [ ] README links all resolve (walkthrough tokens/ids against live DB)
- [ ] Operator submits the form
