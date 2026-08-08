/**
 * Integrations (Accelevents required, Airtable bonus): config routes with
 * write-only secrets, sync as graceful no-op without a key.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, organizer, Client } from '../helpers/api';

let eventId: string;

beforeAll(async () => {
  ({ eventId } = await makeEvent());
});

describe('integration config', () => {
  it('PUT then GET accelevents config; secrets are write-only (never echoed)', async () => {
    // Canonical accelevents keys: apiKey (secret), eventId, baseUrl.
    const org = await organizer();
    const put = await org.put(`/api/events/${eventId}/integrations/accelevents`, {
      json: { config: { apiKey: 'sk-test-super-secret', eventId: 'acc-123' } },
    });
    expect(put.status).toBeLessThan(300);
    const get = await org.get(`/api/events/${eventId}/integrations/accelevents`);
    expect(get.status).toBe(200);
    expect(get.body?.configured).toBe(true);
    expect(get.text).not.toContain('sk-test-super-secret'); // write-only secret
    expect(get.text).toContain('acc-123'); // non-secret config round-trips (positive control)
  });

  it('unknown CONFIG key inside config → 400 invalid_body (schema-validated per kind)', async () => {
    const org = await organizer();
    const res = await org.put(`/api/events/${eventId}/integrations/accelevents`, {
      json: { config: { apiKey: 'x', not_a_real_key: 'y' } },
    });
    expect(res.status).toBe(400);
    expect(res.body?.code).toBe('invalid_body');
  });

  it('PUT with empty apiKey keeps the stored secret (write-only update semantics)', async () => {
    const org = await organizer();
    const res = await org.put(`/api/events/${eventId}/integrations/accelevents`, {
      json: { config: { apiKey: '', eventId: 'acc-456' } },
    });
    expect(res.status).toBeLessThan(300);
    const get = await org.get(`/api/events/${eventId}/integrations/accelevents`);
    expect(get.body?.configured).toBe(true); // secret from the earlier PUT survives
    expect(get.text).toContain('acc-456'); // non-secret updated
    expect(get.text).not.toContain('sk-test-super-secret');
  });

  it('non-canonical key is rejected 400 invalid_body and secret bytes are never echoed (pin #5)', async () => {
    // Ratified: unknown top-level keys = 400 {"code":"invalid_body"}, never silently
    // merged — key-name masking must not be reachable by smuggled keys at all.
    const org = await organizer();
    const put = await org.put(`/api/events/${eventId}/integrations/airtable`, {
      json: { config_json: JSON.stringify({ api_key: 'sk-smuggled-secret-bytes' }) },
    });
    expect(put.status).toBe(400);
    expect(put.body?.code).toBe('invalid_body');
    const get = await org.get(`/api/events/${eventId}/integrations/airtable`);
    expect(get.text).not.toContain('sk-smuggled-secret-bytes');
  });

  it('unknown integration kind → 4xx', async () => {
    const org = await organizer();
    const res = await org.get(`/api/events/${eventId}/integrations/salesforce`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('integration routes without cookie → 401', async () => {
    const res = await new Client().get(`/api/events/${eventId}/integrations/accelevents`);
    expect(res.status).toBe(401);
  });
});

describe('sync', () => {
  it('sync with no/unusable config is a graceful failure, not a 500', async () => {
    const org = await organizer();
    // airtable has no config at all on this fresh event
    const res = await org.post(`/api/events/${eventId}/integrations/airtable/sync`);
    expect(res.status).not.toBe(500);
  });

  it('sync returns a summary and records last_status on the config', async () => {
    const org = await organizer();
    const sync = await org.post(`/api/events/${eventId}/integrations/accelevents/sync`);
    // fake key → the attempt may fail upstream, but the endpoint must respond
    // deliberately and log the outcome
    expect(sync.status).not.toBe(500);
    const get = await org.get(`/api/events/${eventId}/integrations/accelevents`);
    const cfg = get.body?.integration ?? get.body;
    expect(cfg.last_status ?? cfg.last_synced_at, `sync left no trace: ${get.text.slice(0, 300)}`).toBeTruthy();
  });
});
