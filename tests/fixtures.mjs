/**
 * Seed fixture IDs — the values the data session (tenzinyeshi-a4) publishes for
 * db/seed.sql. Integration tests create their own data through the API and do NOT
 * depend on these; smoke.mjs uses them to probe a deployed, seeded stack.
 *
 * STATUS: PUBLISHED by data session 2026-08-08 — matches db/seed.sql; full fixed-ID
 * map in db/seed-notes.md.
 */
export const SEED = {
  published: true,
  eventSlug: 'devconf-2026',
  eventId: '22222222-2222-4222-8222-222222222201',
  formId: '33333333-3333-4333-8333-333333333301', // open CFP form
  // Priya Raman — accepted keynote sub 55555555-5555-4555-8555-555555555501,
  // scheduled in slot aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01 (Main Hall,
  // 2026-10-06T16:00:00Z), 4/4 onboarding tasks done, headshot + slides assets.
  speakerId: '44444444-4444-4444-8444-444444444401',
  speakerToken: 'mtok_s01_9f3a7c1e2b4d', // seeded, non-production
};
