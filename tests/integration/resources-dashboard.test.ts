/**
 * Resources (wiki pages + HTML embed) and the onboarding dashboard.
 * Public resource routes must filter is_public=0 — positive + negative pair.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';

let eventId: string;
let slug: string;
let speakerName: string;

beforeAll(async () => {
  ({ eventId, slug } = await makeEvent());
  const formId = await makeForm(eventId);
  speakerName = uniq('Dash Speaker');
  const { res } = await submitCfp(formId, { name: speakerName, title: 'Dash talk' });
  if (res.status >= 300) throw new Error(`CFP failed: ${res.status}`);
});

describe('resources', () => {
  const publicSlug = 'speaker-guide';
  const privateSlug = 'internal-runbook';

  it('organizer creates public and private resources (positive control)', async () => {
    const org = await organizer();
    const pub = await org.post(`/api/events/${eventId}/resources`, {
      json: {
        title: 'Speaker Guide', slug: publicSlug, is_public: 1, sort: 0,
        body_md: '# Welcome\nSlides due **soon**.',
        embed_html: '<iframe src="https://player.example/deck"></iframe>',
      },
    });
    expect(pub.status).toBeLessThan(300);
    const priv = await org.post(`/api/events/${eventId}/resources`, {
      json: { title: 'Internal Runbook', slug: privateSlug, is_public: 0, sort: 1, body_md: 'secret ops notes' },
    });
    expect(priv.status).toBeLessThan(300);

    const list = await org.get(`/api/events/${eventId}/resources`);
    expect(list.status).toBe(200);
    const resources = list.body?.resources ?? list.body;
    expect(resources.some((r: any) => r.slug === publicSlug)).toBe(true);
    expect(resources.some((r: any) => r.slug === privateSlug)).toBe(true); // organizer sees both
  });

  it('public listing exposes ONLY public resources', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/resources`);
    expect(res.status).toBe(200);
    const resources = res.body?.resources ?? res.body;
    expect(resources.some((r: any) => r.slug === publicSlug)).toBe(true); // positive control
    expect(resources.some((r: any) => r.slug === privateSlug)).toBe(false);
    expect(res.text).not.toContain('secret ops notes');
  });

  it('public fetch by rslug returns the public page with embed_html intact', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/resources/${publicSlug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('player.example/deck');
  });

  it('public fetch of a PRIVATE rslug → 404 (denial for the positive control above)', async () => {
    const res = await new Client().get(`/api/public/events/${slug}/resources/${privateSlug}`);
    expect(res.status).toBe(404);
  });

  it('organizer resources route without cookie → 401', async () => {
    const res = await new Client().get(`/api/events/${eventId}/resources`);
    expect(res.status).toBe(401);
  });

  it('non-boolean-ish is_public → 400 invalid_flag, never a silent coercion', async () => {
    const org = await organizer();
    const res = await org.post(`/api/events/${eventId}/resources`, {
      json: { title: 'Bad flag', slug: 'bad-flag', is_public: 'yes', body_md: 'x' },
    });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('invalid_flag');
  });
});

describe('dashboard', () => {
  it('returns the onboarding matrix including our speaker (positive control)', async () => {
    const org = await organizer();
    const res = await org.get(`/api/events/${eventId}/dashboard`);
    expect(res.status).toBe(200);
    // Contract: per-speaker onboarding status matrix + counts + overdue.
    expect(res.text).toContain(speakerName);
    const body = res.body ?? {};
    const hasCounts = body.counts !== undefined || body.totals !== undefined || body.summary !== undefined;
    expect(hasCounts, `dashboard has no counts-like field: ${res.text.slice(0, 300)}`).toBe(true);
  });

  it('dashboard without cookie → 401', async () => {
    const res = await new Client().get(`/api/events/${eventId}/dashboard`);
    expect(res.status).toBe(401);
  });
});
