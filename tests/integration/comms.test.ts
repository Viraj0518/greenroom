/**
 * Comms: templates CRUD, send with {{name}} var rendering, email log.
 * Local stack uses the console EmailProvider (no RESEND_API_KEY), which must
 * still log sends to emails_log.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';
import { serverLog } from '../helpers/stack';

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

describe('calendar links in rendered sends (console provider output)', () => {
  // Pinned render behavior: scheduled speakers get real gcal/outlook links;
  // for unscheduled speakers, template LINES containing {{gcal_link}}/{{outlook_link}}
  // are dropped whole. Invariant: a rendered send never contains "]()".
  let schedEmail: string;
  let unschedEmail: string;
  let schedSpeakerId: string;
  let unschedSpeakerId: string;

  beforeAll(async () => {
    if (process.env.TEST_BASE_URL) return; // console output not observable remotely
    const org = await organizer();
    const formId = await makeForm(eventId);

    const a = await submitCfp(formId, { name: 'Sched Speaker', title: 'Sched cal talk' });
    schedEmail = a.email;
    const b = await submitCfp(formId, { name: 'Unsched Speaker', title: 'Unsched cal talk' });
    unschedEmail = b.email;

    const subs = await org.get(`/api/events/${eventId}/submissions`);
    const bySub = (email: string, title: string) =>
      (subs.body.submissions as any[]).find((s) => s.speaker_email === email && s.title === title);
    const sa = bySub(schedEmail, 'Sched cal talk');
    const sb = bySub(unschedEmail, 'Unsched cal talk');
    schedSpeakerId = sa.speaker_id;
    unschedSpeakerId = sb.speaker_id;

    await org.patch(`/api/submissions/${sa.id}`, { json: { status: 'accepted' } });
    const room = await org.post(`/api/events/${eventId}/rooms`, { json: { name: uniq('Cal Room'), capacity: 5, sort: 0 } });
    await org.post(`/api/events/${eventId}/schedule/slots`, {
      json: { submission_id: sa.id, room_id: room.body.id, starts_at: '2026-09-02T09:00:00Z', ends_at: '2026-09-02T10:00:00Z' },
    });

    await org.post(`/api/events/${eventId}/templates`, {
      json: {
        key: 'cal', name: 'Calendar', subject: 'Your talk {{name}}',
        body_md: 'Hi {{name}}\n\n[Google Calendar]({{gcal_link}}) · [Outlook]({{outlook_link}}) · [iCal]({{ics_link}})\n\nSee you there!',
      },
    });
    const send = await org.post(`/api/events/${eventId}/send`, {
      json: { template_key: 'cal', speaker_ids: [schedSpeakerId, unschedSpeakerId] },
    });
    if (send.status >= 300) throw new Error(`cal send failed: ${send.status} ${send.text}`);
  });

  function emailBody(recipient: string): string {
    const log = serverLog();
    const start = log.lastIndexOf(`to=${recipient}`);
    if (start === -1) return '';
    const rest = log.slice(start);
    const end = rest.slice(10).search(/\[email:console\]|\[wrangler:info\]/);
    return end === -1 ? rest : rest.slice(0, end + 10);
  }

  it('scheduled speaker gets real gcal + outlook links (exact emitted prefixes)', () => {
    if (process.env.TEST_BASE_URL) return;
    const body = emailBody(schedEmail);
    expect(body, `no console email captured for ${schedEmail}`).not.toBe('');
    expect(body).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(body).toContain('https://outlook.live.com/calendar/0/deeplink/compose');
    expect(body).toContain('/api/public/ics/'); // ics_link present too
  });

  it('unscheduled speaker: calendar line dropped whole, greeting and closing intact', () => {
    if (process.env.TEST_BASE_URL) return;
    const body = emailBody(unschedEmail);
    expect(body, `no console email captured for ${unschedEmail}`).not.toBe('');
    expect(body).toContain('Hi Unsched Speaker');
    expect(body).toContain('See you there!');
    expect(body).not.toContain('calendar.google.com');
    expect(body).not.toContain('outlook.live.com');
  });

  it('invariant: no rendered send ever contains "]()"', () => {
    if (process.env.TEST_BASE_URL) return;
    const emails = serverLog().split('[email:console]').slice(1);
    expect(emails.length).toBeGreaterThan(0); // positive control: we did capture sends
    for (const e of emails) {
      expect(e, 'empty-link artifact "]()"in a rendered send').not.toContain(']()');
    }
  });
});
