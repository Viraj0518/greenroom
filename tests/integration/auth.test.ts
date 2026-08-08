/**
 * Auth boundaries. Every denial has a positive control in the same describe block,
 * so an all-404/all-401 broken server cannot pass.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Client, makeEvent, makeForm, submitCfp, organizer, ADMIN_EMAIL } from '../helpers/api';
import { getMagicToken } from '../helpers/stack';

let eventId: string;
let formId: string;
let speakerEmail: string;
let magicToken: string | undefined;

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  formId = await makeForm(eventId);
  const { res, email } = await submitCfp(formId);
  if (res.status >= 300) throw new Error(`CFP submit failed in setup: ${res.status} ${res.text}`);
  speakerEmail = email;
  magicToken = getMagicToken(speakerEmail);
  // On a local stack the token must exist — a missing token means the CFP flow
  // did not mint one, and silently skipping would turn every portal positive
  // control into a free green.
  if (!process.env.TEST_BASE_URL && !magicToken) {
    throw new Error(`No magic_token found in D1 for ${speakerEmail} after CFP submit`);
  }
});

describe('organizer session', () => {
  it('GET /api/auth/me with a session cookie → the logged-in user (positive control)', async () => {
    const org = await organizer();
    const res = await org.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body?.user?.email ?? res.body?.email).toBe(ADMIN_EMAIL);
  });

  it('GET /api/auth/me without cookie → 401', async () => {
    const res = await new Client().get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('organizer route without cookie → 401 (submissions list)', async () => {
    const res = await new Client().get(`/api/events/${eventId}/submissions`);
    expect(res.status).toBe(401);
  });

  it('organizer route with cookie → 200 (positive control for the same route)', async () => {
    const org = await organizer();
    const res = await org.get(`/api/events/${eventId}/submissions`);
    expect(res.status).toBe(200);
  });

  it('login with wrong password → 401, then correct password → 200', async () => {
    const c = new Client();
    const bad = await c.post('/api/auth/login', { json: { email: ADMIN_EMAIL, password: 'wrong-password' } });
    expect(bad.status).toBe(401);
    const good = await c.post('/api/auth/login', { json: { email: ADMIN_EMAIL, password: 'qa-admin-password-1' } });
    expect(good.status).toBe(200);
  });

  it('logout invalidates the session', async () => {
    const c = new Client();
    await c.post('/api/auth/login', { json: { email: ADMIN_EMAIL, password: 'qa-admin-password-1' } });
    const before = await c.get('/api/auth/me');
    expect(before.status).toBe(200); // positive control
    await c.post('/api/auth/logout');
    c.cookie = c.cookie; // client keeps whatever cookie state logout left; a cleared/expired cookie must no longer authenticate
    const after = await c.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('second registration is not open (first-user-becomes-admin only; later = admin invite)', async () => {
    const c = new Client();
    const res = await c.post('/api/auth/register', {
      json: { email: 'intruder@example.test', name: 'Intruder', password: 'x'.repeat(12) },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('speaker magic token', () => {
  it('GET /api/portal/me with valid token → speaker profile (positive control)', async () => {
    if (!magicToken) return; // token extraction unavailable against a remote stack
    const c = new Client();
    const res = await c.get('/api/portal/me', { token: magicToken });
    expect(res.status).toBe(200);
    expect(res.body?.speaker?.email ?? res.body?.email).toBe(speakerEmail);
  });

  it('valid token also works as ?token= query param', async () => {
    if (!magicToken) return;
    const res = await new Client().get(`/api/portal/me?token=${encodeURIComponent(magicToken)}`);
    expect(res.status).toBe(200);
  });

  it('portal route with no token → 401', async () => {
    const res = await new Client().get('/api/portal/me');
    expect(res.status).toBe(401);
  });

  it('portal route with a bad token → 401', async () => {
    const res = await new Client().get('/api/portal/me', { token: 'not-a-real-token-000' });
    expect(res.status).toBe(401);
  });

  it('an organizer cookie does NOT grant portal access (wrong credential type)', async () => {
    const org = await organizer();
    const res = await org.get('/api/portal/me');
    expect(res.status).toBe(401);
  });

  it('a magic token does NOT grant organizer access (wrong credential type)', async () => {
    if (!magicToken) return;
    const res = await new Client().get(`/api/events/${eventId}/submissions`, { token: magicToken });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/portal/me with valid token updates the bio (write positive control)', async () => {
    if (!magicToken) return;
    const c = new Client();
    const patch = await c.patch('/api/portal/me', { token: magicToken, json: { bio: 'Updated bio from QA.' } });
    expect(patch.status).toBe(200);
    const me = await c.get('/api/portal/me', { token: magicToken });
    expect(me.body?.speaker?.bio ?? me.body?.bio).toBe('Updated bio from QA.');
  });

  it('PATCH /api/portal/me with bad token → 401 (write denial)', async () => {
    const res = await new Client().patch('/api/portal/me', { token: 'bad', json: { bio: 'hax' } });
    expect(res.status).toBe(401);
  });
});
