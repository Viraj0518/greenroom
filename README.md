# GreenRoom

**Open-source speaker & content management for conferences** — a self-hostable alternative to Sessionboard. Run your call-for-papers, speaker onboarding, session review, and agenda building on your own Cloudflare account.

## Features

- **CFP forms** — build custom call-for-speakers forms with conditional logic and automatic category-based track routing.
- **Speaker portal** — self-service magic-link portal where speakers manage bios, headshots, slides, and supporting documents.
- **Communications** — templated speaker emails (Markdown + variables), automated reminders, and calendar invites delivered as ICS files.
- **Evaluation workflows** — multi-round submission scoring with rubrics, reviewer queues, leaderboards, and optional AI-assisted review (Claude).
- **Scheduling** — drag-and-drop agenda builder with automatic conflict detection across rooms, tracks, and speakers.
- **Dashboard** — real-time tracking of outstanding speaker onboarding tasks, with overdue flags.
- **Accelevents integration** — one-way sync that pushes your speakers and sessions to Accelevents (API-key config; no-ops gracefully without one).
- **Resource pages** — wiki-style reference pages for speakers, with HTML embed support.
- **Public embeds** — mobile-friendly speaker gallery and schedule pages, ready to iframe into any website, backed by a CORS-open JSON API.
- **Airtable mirror** (bonus) — optional one-way sync of your data into an Airtable base.

## Self-host quickstart

Prerequisites: Node 22+, [pnpm](https://pnpm.io), a Cloudflare account (free tier works; enable R2 once in the dashboard).

```sh
git clone https://github.com/Viraj0518/greenroom
cd greenroom
pnpm install
pnpm exec wrangler login

# Create your resources
pnpm exec wrangler d1 create greenroom-db      # put the returned id in wrangler.toml
pnpm exec wrangler r2 bucket create greenroom-files

# Apply the database schema
pnpm db:migrate:remote

# Deploy
pnpm exec wrangler pages project create greenroom-dev
pnpm deploy
```

Then open the deployed URL, register the first account (it becomes the admin), and create your event.

### Local development

```sh
pnpm install
pnpm db:migrate:local
pnpm build && pnpm dev        # wrangler pages dev: SPA + API + local D1/R2 at http://127.0.0.1:8788
pnpm dev:app                  # optional: Vite dev server with HMR at :5173, proxying /api to :8788
```

### Configuration

| Name | Kind | Purpose |
|---|---|---|
| `APP_BASE_URL` | var | Public base URL of the deployment (used in emails/links) |
| `EMAIL_FROM` | var | From-address for outbound email |
| `RESEND_API_KEY` | secret (optional) | Send real email via Resend; without it, emails log to console |
| `ANTHROPIC_API_KEY` | secret (optional) | Enables AI-assisted review; feature reports "not configured" without it |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | secrets (optional) | Supabase Storage for file uploads (see Storage options) |

Set secrets with `pnpm exec wrangler pages secret put <NAME> --project-name greenroom-dev`.

### Storage options

File uploads (headshots, slides, documents) work with either backend — the API picks whichever is configured:

- **Cloudflare R2** (preferred): enable R2 on your account, `pnpm exec wrangler r2 bucket create greenroom-files`, and uncomment the `FILES` binding in `wrangler.toml`.
- **Supabase Storage**: create a Supabase project and set the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` secrets on the Pages project.

With neither configured, upload routes return a clean `storage_not_configured` error and everything else keeps working.

## Architecture

- **Monorepo, TypeScript everywhere**, single root package managed with pnpm.
- **`app/`** — Vite + React 18 SPA (React Router, dnd-kit drag-and-drop, own lightweight design system). Builds to `dist/`.
- **`functions/`** — the API: [Hono](https://hono.dev) running on Cloudflare Pages Functions via a single catch-all route (`functions/api/[[route]].ts`).
- **`db/`** — D1 (SQLite) schema, migrations, and seed data. Raw SQL with prepared statements — no ORM.
- **Files** (headshots, slides, documents) live in an R2 bucket, uploaded through the API.
- **Auth** — organizers use email+password cookie sessions; speakers use passwordless magic links.
- **Email** — pluggable `EmailProvider` (console adapter for dev, Resend adapter in production); ICS calendar files generated server-side.
- **AI review** — pluggable `AIReviewer` with an Anthropic adapter (`claude-sonnet-5`).
- **Embeds** — `/embed/speakers/:slug` and `/embed/schedule/:slug` are self-contained, iframe-safe pages fed by public cached JSON endpoints.

See [PLAN.md](PLAN.md) for the roadmap and [CONTRACTS.md](CONTRACTS.md) for the full API + schema contract.

## License

[MIT](LICENSE)
