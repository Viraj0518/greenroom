/**
 * Speaker portal asset uploads (R2-backed).
 *
 * KNOWN-BLOCKED: R2 is not enabled on the Cloudflare account yet (operator
 * dashboard action pending; wrangler.toml FILES binding commented out). Until
 * then these tests are skipped locally via the missing binding and reported as
 * a known-blocked category — the M5 GO/NO-GO must explicitly restate R2 status
 * rather than counting these skips as green.
 * Flip on by uncommenting the FILES binding and setting R2_READY=1.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client } from '../helpers/api';
import { getMagicToken } from '../helpers/stack';

const R2_READY = process.env.R2_READY === '1';

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

describe.skipIf(R2_READY)('R2 disabled: uploads degrade to 501 storage_not_configured (ratified)', () => {
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

describe.skipIf(!R2_READY)('asset upload (R2) — known-blocked until operator enables R2', () => {
  it('uploads a headshot, lists it in portal/me, serves it via /api/assets/:id', async () => {
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

    // headshots are public per contract
    const served = await new Client().get(`/api/assets/${assetId}`);
    expect(served.status).toBe(200);
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
