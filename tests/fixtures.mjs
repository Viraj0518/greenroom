/**
 * Seed fixture IDs — the values the data session (tenzinyeshi-a4) publishes for
 * db/seed.sql. Integration tests create their own data through the API and do NOT
 * depend on these; smoke.mjs uses them to probe a deployed, seeded stack.
 *
 * STATUS: PLACEHOLDERS — awaiting the fixed UUIDs from the data session.
 * Do not invent values; update this file when data announces them.
 */
export const SEED = {
  published: false, // flip to true when real values land
  eventSlug: 'demo-conf',
  eventId: null,
  formId: null,
  speakerId: null, // a seeded speaker with an accepted, scheduled talk
  speakerToken: null, // that speaker's magic token (seeded, non-production)
};
