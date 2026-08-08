# Sessionboard → GreenRoom parity map (UI lane, 2026-08-08)

Research from public sources only: sessionboard.com product/capability pages and
the /explore-the-platform interactive tour. **Structure/IA/workflow only — no
copied text, assets, CSS, or look-and-feel** (PLAN.md hard line). GreenRoom
keeps its own design system and copy.

## Their top-level IA (in-app nav observed in product mocks)

Grouped sidebar: **Collect & Review** (Forms, Send, Evaluation, Agenda) ·
**Relate** (CRM) · **Market** · **Deliver**. Four platform pillars:
Speaker CRM · Submissions & Evaluations · Agenda & Session Planning ·
Speaker Onboarding & Comms.

## Surface-by-surface mapping

### 1. Dashboard (their Speaker CRM home) → /org (DashboardPage)
Their composition: stat cards row (Events / Contacts / Accepted speakers),
"Speaker engagement flow" funnel (All contacts → Emailed → Accepted with
horizontal bars + counts), "Top companies" ranked list, "Contacts by Region".
**GreenRoom adaptation:** stat row (already have) + submissions funnel
(submitted → in review → accepted with bars from counts.submissions_by_status)
+ "Top tracks" ranked list + keep the onboarding matrix as the lower band
(their "Speaker Tasks Dashboard": one view of tasks across speakers, filterable,
with bulk-remind action → wire a "Remind" button per overdue row into /org/comms
prefiltered).

### 2. Submissions (their submission table) → /org/submissions
Their table: Title · status PILL (PENDING / ROUND 1 / ROUND 2 / ACCEPTED) ·
reviewer avatar+name · precise datetime. Multi-form list: form name,
submission count, created date, Open/Closed pill.
**Adaptation:** we match already; add avatar in speaker cell (have), show
round-stage badge when in_review, datetime with time. Forms page gains
submission counts per form (needs count — derive client-side from submissions).

### 3. Review (their Evaluation Plans) → /org/review
Theirs: evaluation plan card (name, Closed/Open, evaluator avatars, due date,
"Progress 48%" bar) + AI Session Reviewer as a named evaluator alongside
humans. Reviewer reminders, evaluator session caps, blinded review.
**Adaptation:** add a round header card (round name, open/closed badge,
progress = reviewed/total bar) above the queue; present AI reviews as an
"AI Session Reviewer" row with avatar-style chip. Keep our two-pane queue.

### 4. Scheduler (their agenda builder) → /org/schedule
Theirs: drag-drop calendar w/ month picker, session status indicators
(confirmed/pending), conflict cards with per-conflict "Resolve" affordance
("There is a scheduled session in Room A during this time"), hide-unconfirmed-
speakers toggle, quick-edit session cards in place, track color coding,
agenda export/embed.
**Adaptation:** we have 5 views + conflict banner. Add: per-conflict rows with
a "Show" (scroll-to/highlight) action instead of one banner blob; session
quick-edit popover on click (title/time/room/duration); "hide breaks" or
"only confirmed" filter toggle; export link to the public embed.

### 5. Portal (their Speaker Resource Center) → /portal
Their portal tabs: **Home / Sessions / Profile / Tasks / Files / Resources**.
**Adaptation:** restructure the single-scroll portal into tabbed sections
matching that IA (Home = welcome + progress + what's-next; Sessions = talks +
calendar links; Profile; Tasks; Files; Resources = public wiki pages). Keep
mobile single-column stacking.

### 6. Comms → /org/comms
Theirs: templates + bulk reminders driven BY task/deadline state ("send to all
speakers with outstanding tasks"), SMS/email templates, comms tied to speaker
record.
**Adaptation:** add "By outstanding task" audience option in SendModal
(speakers missing task X — compute from dashboard matrix), keep template
editor + log.

### 7. CFP flow
Theirs: Form → Portal → Evaluation stepper; draft submissions; multi-form.
We match; success screen already routes to portal (pin #8).

## Notes
- Their look: light indigo/white SaaS; ours stays GreenRoom green/dark-capable.
- "AI reports & dashboards" and agent-native angle = our AI review + (maybe)
  a summary line on dashboard. Out of scope for parity pass.
- Priority per coordinator: dashboard first, then portal tabs, review header,
  scheduler conflict rows, comms audience, submissions counts.
