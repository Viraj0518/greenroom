# Submission packet — "$10,000 Kill My SaaS" (Sessionboard)

Everything the entry form needs. Target: **Wednesday Aug 12, before 10 PM PT.**
Submit ONLY after QA's explicit GO on the candidate sha (M5 gate).

> **✅ GATE PASSED — CLEARED TO SUBMIT (2026-08-08, design iteration 3 promoted)**
> **Deployed artifact**: sha `cd23cef` (supersedes d0f9bc5, 4f73b67, bca6296) — this exact sha's clean-worktree build (bundle `index-Bcx0SNzv.js`) is what both URLs below serve, content-hash-verified. Fixes a judge-visible dashboard horizontal-overflow defect present in d0f9bc5.
> **Repo main tip**: ahead of `cd23cef` by docs-only commits; the deployed artifact is exactly `cd23cef`'s build. Later shas ship only after their own gate (audit + regate + restamp).
> Immutable deployment: https://980bbfef.greenroom-dev.pages.dev (maintainer clean-worktree build of the gated sha)
> Alias: https://greenroom-dev.pages.dev (serving the same deployment)
> QA GO: quiesced full suite 101 pass / 1 skip / 0 fail on cd23cef + clean-rebuild content-hash identity + zero-external-origin scan + read-only staging leg 18/18 + QA browser pass; coordinator browser audit GREEN (verified: stat-row wrap fix removes the overflow, brand mark, curated counts). Stated limitation: the sub-900px mobile top bar is UI-attested only (QA harness width floor); the portal emoji sweep rests on QA's browser pass + UI review rather than coordinator observation.

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
- [x] 7. Accelevents — one-way sync, API-key config, graceful no-op (implemented per public API docs; unverified against a live Accelevents account — Airtable mirror, same pattern, is fully verified)
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

- [x] UI pencils-down received
- [x] Candidate sha announced to QA (+ immutable deployment URL, Source verified)
- [x] QA GO received ← **hard gate, no GO no submit**
- [x] Final deploy == candidate sha; read-only smoke 18/18 on both alias and immutable URL
- [x] README links all resolve (walkthrough tokens/ids verified against live DB)
- [ ] Operator submits the form ← **the only remaining action**
