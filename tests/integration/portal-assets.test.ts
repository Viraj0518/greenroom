/**
 * Speaker portal asset uploads — provider-agnostic (pin #7: StorageProvider
 * selects r2 binding → supabase env → 501 storage_not_configured degrade).
 *
 * Gate: STORAGE_READY=1 runs the real upload/download/delete tests (the expected
 * staging state once backend's adapter deploys); unset runs the 501-degrade
 * assertions instead. The M5 GO/NO-GO must state which mode the gate ran in —
 * a skipped category is not a green one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client } from '../helpers/api';
import { getMagicToken } from '../helpers/stack';

const STORAGE_READY = process.env.STORAGE_READY === '1';

let magicToken: string | undefined;

beforeAll(async () => {
  const { eventId } = await makeEvent();
  const formId = await makeForm(eventId);
  const { res, email } = await submitCfp(formId, { title: 'Asset talk' });
  if (res.status >= 300) throw new Error(`CFP failed: ${res.status}`);
  magicToken = getMagicToken(email);
  if (!process.env.TEST_BASE_URL && !magicToken) throw new Error('no magic token after CFP');
});

describe('portal task completion (no R2 needed)', () => {
  it('POST /api/portal/tasks/:taskKey/done with bad token → 401; valid token is not a 401', async () => {
    const denied = await new Client().post('/api/portal/tasks/profile/done', { token: 'bad' });
    expect(denied.status).toBe(401);
    if (!magicToken) return;
    const ok = await new Client().post('/api/portal/tasks/profile/done', { token: magicToken });
    // Whether 'bio' exists as a task for this event is data-dependent; auth must pass either way.
    expect(ok.status).not.toBe(401);
    expect(ok.status).not.toBe(500);
  });
});

describe.skipIf(STORAGE_READY)('storage unconfigured: uploads degrade to 501 storage_not_configured', () => {
  it('upload with a VALID token → 501 storage_not_configured, while bad token still 401s', async () => {
    const bad = await new Client().post('/api/portal/assets', { token: 'bad' });
    expect(bad.status).toBe(401); // auth still checked before storage
    if (!magicToken) return;
    const form = new FormData();
    form.set('kind', 'headshot');
    form.set('file', new File([new Uint8Array(4)], 'x.png', { type: 'image/png' }));
    const res = await new Client().post('/api/portal/assets', { token: magicToken, form });
    expect(res.status).toBe(501);
    expect(res.body?.code).toBe('storage_not_configured');
  });
});

describe.skipIf(!STORAGE_READY)('asset upload/download/delete (live storage provider)', () => {
  it('uploads a headshot, lists it in portal/me, serves it, and auto-completes the headshot task', async () => {
    if (!magicToken) return;
    const c = new Client();
    const form = new FormData();
    form.set('kind', 'headshot');
    form.set('file', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'headshot.png', { type: 'image/png' }));
    const up = await c.post('/api/portal/assets', { token: magicToken, form });
    expect(up.status).toBeLessThan(300);
    const assetId = up.body?.id ?? up.body?.asset?.id;
    expect(assetId).toBeTruthy();

    const me = await c.get('/api/portal/me', { token: magicToken });
    const assets = me.body?.assets ?? [];
    expect(assets.some((a: any) => a.id === assetId && a.kind === 'headshot')).toBe(true);

    // pin #7 / contract: upload marks the matching onboarding task done
    const tasks = me.body?.tasks ?? [];
    const headshotTask = tasks.find((t: any) => (t.task_key ?? t.key) === 'headshot');
    if (headshotTask) expect(headshotTask.done).toBeTruthy();

    // headshots are public per contract — served bytes round-trip
    const served = await new Client().get(`/api/assets/${assetId}`);
    expect(served.status).toBe(200);
    expect(served.text.length).toBeGreaterThan(0);
  });

  it('DELETE removes the asset: gone from portal/me and no longer served', async () => {
    if (!magicToken) return;
    const c = new Client();
    const form = new FormData();
    form.set('kind', 'document');
    form.set('file', new File([new Uint8Array(16)], 'notes.txt', { type: 'text/plain' }));
    const up = await c.post('/api/portal/assets', { token: magicToken, form });
    expect(up.status).toBeLessThan(300);
    const assetId = up.body?.id ?? up.body?.asset?.id;

    const del = await c.delete(`/api/portal/assets/${assetId}`, { token: magicToken });
    expect(del.status).toBeLessThan(300);
    const me = await c.get('/api/portal/me', { token: magicToken });
    expect((me.body?.assets ?? []).some((a: any) => a.id === assetId)).toBe(false);
    const served = await new Client().get(`/api/assets/${assetId}`, { token: magicToken });
    expect(served.status).toBe(404);
  });

  it('upload with bad token → 401 (denial for the upload positive control)', async () => {
    const form = new FormData();
    form.set('kind', 'headshot');
    form.set('file', new File([new Uint8Array(4)], 'x.png', { type: 'image/png' }));
    const res = await new Client().post('/api/portal/assets', { token: 'bad', form });
    expect(res.status).toBe(401);
  });

  it('non-headshot assets are NOT publicly served without a token', async () => {
    if (!magicToken) return;
    const c = new Client();
    const form = new FormData();
    form.set('kind', 'slides');
    form.set('file', new File([new Uint8Array(8)], 'deck.pdf', { type: 'application/pdf' }));
    const up = await c.post('/api/portal/assets', { token: magicToken, form });
    expect(up.status).toBeLessThan(300);
    const assetId = up.body?.id ?? up.body?.asset?.id;
    const anon = await new Client().get(`/api/assets/${assetId}`);
    expect([401, 403, 404]).toContain(anon.status);
    const authed = await new Client().get(`/api/assets/${assetId}`, { token: magicToken });
    expect(authed.status).toBe(200); // positive control for the same asset
  });
});
