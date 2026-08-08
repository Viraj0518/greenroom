# Seed notes — fixed IDs for tests & demos

All IDs are fixed, valid v4-shaped UUIDs with a recognizable block per table:
`1111…` users, `2222…` events, `3333…` forms, `4444…` speakers, `5555…` submissions,
`6666…` rounds, `7777…` reviews, `8888…` rooms, `9999…` tracks, `aaaa…` slots,
`bbbb…` templates, `cccc…` emails_log, `dddd…` onboarding_tasks, `eeee…` speaker_tasks,
`ffff…` resources, `a5a5…` assets, `1a1a…` integrations. The last two digits are the
row counter (…01, …02, …).

## Event

| What | Value |
|---|---|
| Event id | `22222222-2222-4222-8222-222222222201` |
| Slug | `devconf-2026` |
| Dates | 2026-10-06 → 2026-10-08, `America/Los_Angeles` (UTC-7; 9:00 local = 16:00Z) |
| CFP form id (open) | `33333333-3333-4333-8333-333333333301` |

## Users (organizers)

`password_hash` is the literal placeholder `PLACEHOLDER_HASH_demo-greenroom-2026` —
**backend must replace it** with its real hash of `demo-greenroom-2026` (agreed format TBD).

| id | email | role |
|---|---|---|
| `11111111-1111-4111-8111-111111111101` | admin@example.com | admin |
| `11111111-1111-4111-8111-111111111102` | jordan.kim@example.com | reviewer |
| `11111111-1111-4111-8111-111111111103` | sam.osei@example.com | reviewer |

## Speakers (44444444-…-44444444440NN)

| # | id suffix | Name | Email | magic_token | Status of their subs |
|---|---|---|---|---|---|
| 01 | …4401 | Priya Raman | priya.raman@example.com | `mtok_s01_9f3a7c1e2b4d` | accepted (keynote, **scheduled**) + rejected |
| 02 | …4402 | Jonas Weber | jonas.weber@example.com | `mtok_s02_5c8e1a9d3f70` | accepted (scheduled) |
| 03 | …4403 | Amara Diallo | amara.diallo@example.com | `mtok_s03_b2d64e0c7a15` | accepted (scheduled) + waitlisted |
| 04 | …4404 | Diego Fuentes | diego.fuentes@example.com | `mtok_s04_e7a90b3c5d21` | accepted workshop (scheduled) |
| 05 | …4405 | Mei-Ling Chen | meiling.chen@example.com | `mtok_s05_1f4c8d2e6b93` | accepted (scheduled) + rejected |
| 06 | …4406 | Tomás Aguilar | tomas.aguilar@example.com | `mtok_s06_8a2b5f7c0d46` | accepted (scheduled) + withdrawn; 0/4 onboarding done |
| 07 | …4407 | Nadia Petrova | nadia.petrova@example.com | `mtok_s07_3d6e9a1b4c78` | accepted, **NOT scheduled** (drag-drop demo) |
| 08 | …4408 | Kwame Mensah | kwame.mensah@example.com | `mtok_s08_c5f01d8e2a67` | accepted, **NOT scheduled** (drag-drop demo) |
| 09 | …4409 | Sofia Lindqvist | sofia.lindqvist@example.com | `mtok_s09_7b3a6c9d0e52` | in_review |
| 10 | …4410 | Ravi Patel | ravi.patel@example.com | `mtok_s10_0e8d4b6f1a39` | in_review (has AI review) |
| 11 | …4411 | Hannah Blum | hannah.blum@example.com | `mtok_s11_6a1c3e8b5d94` | in_review (has AI review) |
| 12 | …4412 | Lucas Moreau | lucas.moreau@example.com | `mtok_s12_2f7d0a4c8e16` | submitted |
| 13 | …4413 | Yuki Tanaka | yuki.tanaka@example.com | `mtok_s13_9c5b2e7f3a80` | submitted |
| 14 | …4414 | Fatima Zahra | fatima.zahra@example.com | `mtok_s14_4d8f1b6a0c23` | submitted |

**Canonical smoke-test speaker: #01 Priya Raman** — accepted keynote
(`55555555-5555-4555-8555-555555555501`) scheduled in slot
`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01` (Main Hall, 2026-10-06T16:00Z), full
onboarding done, has headshot + slides assets → exercises ICS, portal, embeds.

## Submissions (55555555-…-55555555550NN → status)

01–08 **accepted** (speakers 01–08 in order) · 09–11 **in_review** · 12–14 **submitted** ·
15 (s01) + 16 (s05) **rejected** · 17 (s03) **waitlisted** · 18 (s06) **withdrawn**.
Sub 04 is the workshop (answers exercise the `workshop_duration` showIf); subs 02, 07, 12
have `needs_travel: true` + `travel_notes` (second conditional).

## Review rounds

- Round 1 (closed): `66666666-6666-4666-8666-666666666601` — rubric relevance/clarity/novelty, 14 reviews incl. 2 AI (`reviewer_id='ai'`, `ai=1`).
- Round 2 (open): `66666666-6666-4666-8666-666666666602` — rubric depth/delivery/fit, 4 reviews incl. 1 AI.

## Rooms / tracks

Rooms: `…8801` Main Hall (400) · `…8802` Workshop A (60) · `…8803` Studio B (120) · `…8804` Terrace (80).
Tracks: `…9901` AI & Data `#7c5cff` · `…9902` Web & Frontend `#0ea5e9` · `…9903` Cloud & Infra `#10b981` · `…9904` Community `#f59e0b`.

## Schedule (aaaa…01–09)

Deliberately **conflict-free** (verified: no same-room overlap, no same-speaker overlap).
Day 1: keynote (sub01, Main Hall 16:00Z) → break → sub02 Main Hall ∥ sub03 Studio B →
sub04 workshop (90 min, Workshop A). Day 2: sub05 Main Hall ∥ sub06 Studio B, lunch break.
Day 3: closing keynote (title-only slot). Subs 07 & 08 are accepted but **unscheduled** —
drag them in during the demo; Terrace is an empty room for drop targets.

## Comms, tasks, resources, integrations

- Templates (`bbbb…01–04`): keys `accepted`, `rejected`, `reminder`, `schedule_live`; `{{name}}`-style vars.
- emails_log: 8 accepted + 2 rejected + 1 reminder, all `status='sent'`, `provider='console'`.
- Onboarding task keys: `bio`, `headshot`, `slides` (optional), `av_form`. Completion is mixed
  across speakers 01–08 (s01 = 4/4 … s06 = 0/4 and overdue → dashboard has real signal).
- Resources: `speaker-guide` (public) · `venue-av` (public, **has embed_html** iframe) ·
  `pc-handbook` (internal, `is_public=0` — must NOT appear on public routes).
- Integrations: one `accelevents` + one `airtable` row, both `not_configured` → graceful no-op.

## Regenerating

`seed.sql` starts with `DELETE FROM` in dependency order — safe to re-run any time after
migrations. Times are ISO-8601 UTC strings throughout.
