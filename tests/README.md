# GreenRoom tests (QA-owned)

Contract-first: everything here tests the HTTP routes exactly as written in
`CONTRACTS.md` — the deployed entrypoint, never implementation internals.

## Layout

- `integration/` — vitest suites against a real local stack (`wrangler pages dev`
  + `--local` D1). Self-contained: each suite creates its own event/form/speakers
  through the API, so they do not depend on seed data.
- `smoke.mjs` — post-deploy smoke against a URL: `node tests/smoke.mjs <base-url>`.
  Read-mostly; uses seed fixtures from `fixtures.mjs`.
- `helpers/stack.ts` — boots/tears down the stack (vitest globalSetup); applies
  `db/` migrations + seed to a throwaway state dir (`tests/.state`, gitignore it).
- `helpers/api.ts` — HTTP client + builders (organizer login, event, form, CFP).
- `fixtures.mjs` — fixed seed UUIDs published by the data session. Placeholders
  until published; do not invent values.

## Running

```sh
pnpm test                          # = vitest run -c tests/vitest.config.ts (script owned by maintainer)
TEST_BASE_URL=http://... pnpm test # reuse an already-running stack (skips boot + magic-token DB reads)
node tests/smoke.mjs https://greenroom-dev.pages.dev
```

## Required devDependencies (maintainer: package.json)

- `vitest` (^2), `typescript`, `wrangler` — test script: `vitest run -c tests/vitest.config.ts`

## Conventions

- Every denial test has a positive control on the same route/flow, so an
  all-404 or all-401 broken server cannot pass green.
- Conflict detection has negative controls (non-overlap, touching boundaries).
- Magic tokens are never exposed by the API (by design); tests extract them from
  the local D1 as fixture data — that is harness plumbing, not an API assertion.
- Contract ambiguities discovered while writing tests are escalated to the
  coordinator, not silently absorbed into loose assertions.
