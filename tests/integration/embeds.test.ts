/**
 * Public embeds: CORS-open, public-only data, embed pages iframe-safe.
 * Public-only check: a speaker whose submission is NOT accepted must not leak.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';

let eventId: string;
let slug: string;
let acceptedEmail: string;
let acceptedName: string;
let pendingName: string;

beforeAll(async () => {
  ({ eventId, slug } = await makeEvent());
  const formId = await makeForm(eventId);

  acceptedName = uniq('Accepted Speaker');
  pendingName = uniq('Pending Speaker');
  const a = await submitCfp(formId, { name: acceptedName, title: 'Accepted talk' });
  const p = await submitCfp(formId, { name: pendingName, title: 'Pending talk' });
  if (a.res.status >= 300 || p.res.status >= 300) throw new Error('CFP setup failed');
  acceptedEmail = a.email;

  const org = await organizer();
  const subs = await org.get(`/api/events/${eventId}/submissions`);
  const list = subs.body?.submissions ?? subs.body;
  const accSub = list.find((s: any) => s.speaker_email === acceptedEmail || s.speaker?.email === acceptedEmail);
  await org.patch(`/api/submissions/${accSub.id}`, { json: { status: 'accepted' } });

  // schedule the accepted talk so the schedule embed has content
  const room = await org.post(`/api/events/${eventId}/rooms`, { json: { name: uniq('Embed Room'), capacity: 10, sort: 0 } });
  await org.post(`/api/events/${eventId}/schedule/slots`, {
    json: {
      submission_id: accSub.id, room_id: room.body?.id ?? room.body?.room?.id,
      starts_at: '2026-09-01T10:00:00Z', ends_at: '2026-09-01T11:00:00Z',
    },
  });
});

describe('public speakers endpoint', () => {
  it('is CORS-open and returns the accepted speaker (positive control)', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/speakers`, {
      headers: { origin: 'https://external-site.example' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const speakers = res.body?.speakers ?? res.body;
    expect(Array.isArray(speakers)).toBe(true);
    expect(speakers.some((s: any) => s.name === acceptedName)).toBe(true);
  });

  it('does NOT include non-accepted speakers (public-only)', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/speakers`);
    const speakers = res.body?.speakers ?? res.body;
    expect(speakers.some((s: any) => s.name === pendingName)).toBe(false);
  });

  it('does NOT leak private fields (email, magic_token)', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/speakers`);
    expect(res.text).not.toContain(acceptedEmail);
    expect(res.text.toLowerCase()).not.toContain('magic_token');
  });

  it('unknown slug → 404 (with the 200 positive control above)', async () => {
    const res = await new Client().get(`/api/public/events/no-such-event-slug/speakers`);
    expect(res.status).toBe(404);
  });
});

describe('public schedule endpoint', () => {
  it('is CORS-open and contains the scheduled accepted talk', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/schedule`);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.text).toContain('Accepted talk');
  });

  it('does not contain unscheduled/pending talks', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/schedule`);
    expect(res.text).not.toContain('Pending talk');
  });
});

describe('embed pages', () => {
  it('GET /embed/speakers/:slug serves a self-contained HTML page', async () => {
    const res = await new Client().get(`/embed/speakers/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
    // iframe-safe: must not forbid framing
    const xfo = res.headers.get('x-frame-options');
    expect(xfo === null || !/deny|sameorigin/i.test(xfo)).toBe(true);
  });

  it('GET /embed/schedule/:slug serves HTML too', async () => {
    const res = await new Client().get(`/embed/schedule/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
  });

  it('embed pages are server-rendered + self-contained: no SPA bundle, < 30 KB (pin #6)', async () => {
    // Guards against the SPA-fallback false green: Pages serves index.html with a
    // 200 for any unknown path, which is HTML but is NOT a server-rendered embed.
    for (const p of [`/embed/speakers/${slug}`, `/embed/schedule/${slug}`]) {
      const res = await new Client().get(p);
      expect(res.status).toBe(200);
      expect(res.text.length, `${p} exceeds the 30 KB embed budget`).toBeLessThan(30_000);
      // pin #6 + backend contract: fully server-rendered — zero script tags
      expect(res.text, `${p} contains a <script> — embeds must be script-free`).not.toMatch(/<script\b/i);
      expect(res.headers.get('cache-control') ?? '').toMatch(/max-age=60/);
      // server-rendered = the event's actual content is already in the HTML
      expect(res.text).toContain(p.includes('speakers') ? acceptedName : 'Accepted talk');
    }
  });

  it('public JSON endpoints carry the 60s cache header (pin #6)', async () => {
    for (const p of [`/api/public/events/${slug}/speakers`, `/api/public/events/${slug}/schedule`]) {
      const res = await new Client().get(p);
      expect(res.headers.get('cache-control') ?? '', `${p} missing 60s cache`).toMatch(/max-age=60/);
    }
  });
});
