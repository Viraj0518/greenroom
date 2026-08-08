/**
 * CFP: public form spec, submit → speaker + submission created, category routing,
 * conditional-logic validation. Contract: CONTRACTS.md "Forms & submissions".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Client, makeEvent, makeForm, submitCfp, organizer, uniq, CFP_SPEC } from '../helpers/api';

let eventId: string;
let formId: string;

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  formId = await makeForm(eventId);
});

describe('public form spec', () => {
  it('GET /api/public/forms/:formId returns the spec without auth', async () => {
    const anon = new Client();
    const res = await anon.get(`/api/public/forms/${formId}`);
    expect(res.status).toBe(200);
    const spec = typeof res.body?.spec_json === 'string' ? JSON.parse(res.body.spec_json) : (res.body?.spec ?? res.body);
    expect(JSON.stringify(spec)).toContain('category');
  });

  it('GET of a nonexistent form 404s (and the good form 200s — positive control above)', async () => {
    const anon = new Client();
    const res = await anon.get(`/api/public/forms/00000000-0000-4000-8000-00000000dead`);
    expect(res.status).toBe(404);
  });
});

describe('submit → speaker + submission + routing', () => {
  it('creates speaker and submission, applies category routing (Talk → Main Stage)', async () => {
    const { res, email } = await submitCfp(formId, {
      answers: { category: 'Talk', abstract: 'A talk abstract.' },
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const org = await organizer();
    const subs = await org.get(`/api/events/${eventId}/submissions`);
    expect(subs.status).toBe(200);
    const list = subs.body?.submissions ?? subs.body;
    expect(Array.isArray(list)).toBe(true);
    const mine = list.filter((s: any) => s.speaker_email === email || s.speaker?.email === email);
    expect(mine.length).toBe(1);
    expect(mine[0].category).toBe('Talk');
    expect(mine[0].track).toBe('Main Stage');
    expect(mine[0].status).toBe('submitted');
  });

  it('routes Workshop → Hands-on', async () => {
    const { res, email } = await submitCfp(formId, {
      answers: { category: 'Workshop', abstract: 'A workshop.', equipment: 'Projector' },
    });
    expect(res.status).toBeLessThan(300);
    const org = await organizer();
    const subs = await org.get(`/api/events/${eventId}/submissions`);
    const mine = (subs.body?.submissions ?? subs.body).filter(
      (s: any) => s.speaker_email === email || s.speaker?.email === email,
    );
    expect(mine[0]?.track).toBe('Hands-on');
  });

  it('same email twice reuses the speaker (UNIQUE(event_id,email)) and creates a second submission', async () => {
    const email = `${uniq('dup')}@example.test`;
    const a = await submitCfp(formId, { email, answers: { category: 'Talk', abstract: 'First.' } });
    const b = await submitCfp(formId, { email, answers: { category: 'Talk', abstract: 'Second.' } });
    expect(a.res.status).toBeLessThan(300);
    expect(b.res.status).toBeLessThan(300);
    const org = await organizer();
    const subs = await org.get(`/api/events/${eventId}/submissions`);
    const mine = (subs.body?.submissions ?? subs.body).filter(
      (s: any) => s.speaker_email === email || s.speaker?.email === email,
    );
    expect(mine.length).toBe(2);
  });
});

describe('conditional-logic validation', () => {
  it('hidden conditionally-required field may be omitted (category=Talk, no equipment) — positive control', async () => {
    const { res } = await submitCfp(formId, { answers: { category: 'Talk', abstract: 'ok' } });
    expect(res.status).toBeLessThan(300);
  });

  it('shown conditionally-required field must be present (category=Workshop, no equipment → 4xx)', async () => {
    const { res } = await submitCfp(formId, { answers: { category: 'Workshop', abstract: 'ok' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('unconditionally required field missing → 4xx', async () => {
    // abstract: '' overrides the helper's default answer — blank must fail required validation
    const { res } = await submitCfp(formId, { answers: { category: 'Talk', abstract: '' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('submitting to a nonexistent form → 404', async () => {
    const { res } = await submitCfp('00000000-0000-4000-8000-00000000dead');
    expect(res.status).toBe(404);
  });

  it('missing title → exactly the pinned 400 {"error":"title required"}', async () => {
    const { res } = await submitCfp(formId, { answers: { title: '', category: 'Talk', abstract: 'ok' } });
    expect(res.status).toBe(400);
    expect(res.body?.error).toBe('title required');
  });
});

describe('form open/closed flag', () => {
  it('is_open:0 actually closes the form — public submit refused (regression: flag inversion)', async () => {
    // Backend fixed a latent mirror of the is_public bug where is_open:0 stored as OPEN.
    const closedFormId = await makeForm(eventId, CFP_SPEC).catch(() => null);
    const org = await organizer();
    const res = await org.post(`/api/events/${eventId}/forms`, {
      json: { name: 'Closed CFP', is_open: 0, spec: CFP_SPEC },
    });
    expect(res.status).toBe(201);
    const closed = res.body?.id;
    const { res: submit } = await submitCfp(closed);
    expect(submit.status).toBeGreaterThanOrEqual(400);
    expect(submit.status).toBeLessThan(500);
    // positive control: the open form still accepts (closedFormId create also proves is_open:1 path)
    expect(closedFormId).toBeTruthy();
    const { res: ok } = await submitCfp(formId);
    expect(ok.status).toBeLessThan(300);
  });
});

describe('pin #5: unknown top-level body keys are 400 invalid_body, never silently ignored', () => {
  it('forms POST with spec_json (the DB column name) → 400, not an empty-spec form', async () => {
    // The original footgun: this body used to 201 with a silently-empty spec.
    const org = await organizer();
    const res = await org.post(`/api/events/${eventId}/forms`, {
      json: { name: 'Bad CFP', is_open: 1, spec_json: JSON.stringify(CFP_SPEC) },
    });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('invalid_body');
  });

  it('forms POST with an arbitrary unknown key → 400 invalid_body (canonical body 201s — positive control)', async () => {
    const org = await organizer();
    const bad = await org.post(`/api/events/${eventId}/forms`, {
      json: { name: 'CFP', is_open: 1, spec: CFP_SPEC, totally_unknown_key: 1 },
    });
    expect(bad.status).toBe(400);
    expect(bad.body?.code).toBe('invalid_body');
    const good = await org.post(`/api/events/${eventId}/forms`, {
      json: { name: 'CFP ok', is_open: 1, spec: CFP_SPEC },
    });
    expect(good.status).toBe(201);
  });
});
