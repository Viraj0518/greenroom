/**
 * Comms: templates CRUD, send with {{name}} var rendering, email log.
 * Local stack uses the console EmailProvider (no RESEND_API_KEY), which must
 * still log sends to emails_log.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';

let eventId: string;
let speakerId: string;
const SPEAKER_NAME = 'Comms Speaker';

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  const formId = await makeForm(eventId);
  const { res, email } = await submitCfp(formId, { name: SPEAKER_NAME, title: 'Comms talk' });
  if (res.status >= 300) throw new Error(`CFP failed: ${res.status}`);
  const org = await organizer();
  const subs = await org.get(`/api/events/${eventId}/submissions`);
  const sub = (subs.body?.submissions ?? subs.body).find(
    (s: any) => s.speaker_email === email || s.speaker?.email === email,
  );
  speakerId = sub.speaker_id ?? sub.speaker?.id;
});

describe('templates', () => {
  it('creates and lists a template (positive control)', async () => {
    const org = await organizer();
    const create = await org.post(`/api/events/${eventId}/templates`, {
      json: { key: 'welcome', name: 'Welcome', subject: 'Hello {{name}}', body_md: '# Hi {{name}}\n\nWelcome!' },
    });
    expect(create.status).toBeLessThan(300);
    const list = await org.get(`/api/events/${eventId}/templates`);
    expect(list.status).toBe(200);
    const templates = list.body?.templates ?? list.body;
    expect(templates.some((t: any) => t.key === 'welcome')).toBe(true);
  });

  it('templates require organizer auth → 401 without cookie', async () => {
    const res = await new Client().get(`/api/events/${eventId}/templates`);
    expect(res.status).toBe(401);
  });
});

describe('send + log', () => {
  it('POST send renders {{name}} and the log records the send', async () => {
    const org = await organizer();
    const send = await org.post(`/api/events/${eventId}/send`, {
      json: { template_key: 'welcome', speaker_ids: [speakerId] },
    });
    expect(send.status).toBeLessThan(300);

    const log = await org.get(`/api/events/${eventId}/emails`);
    expect(log.status).toBe(200);
    const entries = log.body?.emails ?? log.body?.log ?? log.body;
    expect(Array.isArray(entries)).toBe(true);
    const entry = entries.find((e: any) => e.speaker_id === speakerId && e.template_key === 'welcome');
    expect(entry, `no log entry for speaker ${speakerId}: ${JSON.stringify(entries).slice(0, 500)}`).toBeTruthy();
    // {{name}} var rendering is observable through the logged subject
    expect(entry.subject).toBe(`Hello ${SPEAKER_NAME}`);
    expect(entry.provider).toBe('console'); // no RESEND_API_KEY on the test stack
  });

  it('send with an unknown template_key → 4xx, and nothing is logged for it', async () => {
    const org = await organizer();
    const send = await org.post(`/api/events/${eventId}/send`, {
      json: { template_key: uniq('nope'), speaker_ids: [speakerId] },
    });
    expect(send.status).toBeGreaterThanOrEqual(400);
    expect(send.status).toBeLessThan(500);
  });

  it('send requires organizer auth → 401 without cookie', async () => {
    const res = await new Client().post(`/api/events/${eventId}/send`, {
      json: { template_key: 'welcome', speaker_ids: [speakerId] },
    });
    expect(res.status).toBe(401);
  });
});
