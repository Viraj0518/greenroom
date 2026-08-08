/**
 * Envelope contract-shape tests (coordinator-directed after the SPA black-screen
 * root cause): every list endpoint returns a NAMED-KEY envelope, never a bare
 * array. The SPA's api.ts and its dev mocks must unwrap exactly these keys —
 * a mock returning a bare array reproduces the false-green that shipped three
 * black-screen pages.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer } from '../helpers/api';

let eventId: string;

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  const formId = await makeForm(eventId);
  await submitCfp(formId, { title: 'Envelope probe' });
  const org = await organizer();
  await org.post(`/api/events/${eventId}/rounds`, {
    json: { name: 'Env round', round_no: 1, is_open: 1, rubric: { criteria: [] } },
  });
  await org.post(`/api/events/${eventId}/templates`, {
    json: { key: 'env', name: 'Env', subject: 's', body_md: 'b' },
  });
  await org.post(`/api/events/${eventId}/resources`, {
    json: { title: 'Env resource', slug: 'env-res', is_public: true, body_md: 'x' },
  });
  await org.post(`/api/events/${eventId}/rooms`, { json: { name: 'Env room', capacity: 1, sort: 0 } });
  await org.post(`/api/events/${eventId}/tracks`, { json: { name: 'Env track', color: '#fff', sort: 0 } });
});

const LIST_ENDPOINTS: Array<[string, string]> = [
  ['/api/events', 'events'],
  ['/api/events/:e/forms', 'forms'],
  ['/api/events/:e/submissions', 'submissions'],
  ['/api/events/:e/rounds', 'rounds'],
  ['/api/events/:e/templates', 'templates'],
  ['/api/events/:e/emails', 'emails'],
  ['/api/events/:e/resources', 'resources'],
  ['/api/events/:e/rooms', 'rooms'],
  ['/api/events/:e/tracks', 'tracks'],
];

describe('list endpoints return named envelopes, never bare arrays', () => {
  for (const [tmpl, key] of LIST_ENDPOINTS) {
    it(`${tmpl} → { ${key}: [...] }`, async () => {
      const org = await organizer();
      const res = await org.get(tmpl.replace(':e', eventId));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body), `${tmpl} returned a BARE ARRAY — envelope contract violated`).toBe(false);
      expect(Array.isArray(res.body?.[key]), `${tmpl} missing "${key}" array key: ${res.text.slice(0, 200)}`).toBe(true);
    });
  }

  it('/api/events/:e/schedule → { slots: [...], conflicts: [...] }', async () => {
    const org = await organizer();
    const res = await org.get(`/api/events/${eventId}/schedule`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.slots)).toBe(true);
    expect(Array.isArray(res.body?.conflicts)).toBe(true);
  });

  it('/api/events/:e/leaderboard → { round_id, rows: [...] }', async () => {
    const org = await organizer();
    const rounds = await org.get(`/api/events/${eventId}/rounds`);
    const roundId = rounds.body.rounds[0].id;
    const res = await org.get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    expect(Array.isArray(res.body?.rows)).toBe(true);
    expect(res.body?.round_id).toBe(roundId);
  });

  it('public speakers/schedule envelopes: { speakers } / grouped schedule object', async () => {
    const org = await organizer();
    const ev = await org.get(`/api/events/${eventId}`);
    const slug = ev.body?.slug ?? ev.body?.event?.slug;
    const speakers = await org.get(`/api/public/events/${slug}/speakers`);
    expect(Array.isArray(speakers.body), 'public speakers is a bare array').toBe(false);
    expect(Array.isArray(speakers.body?.speakers)).toBe(true);
  });
});
