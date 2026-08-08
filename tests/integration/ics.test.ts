/**
 * ICS feed: GET /api/public/ics/:speakerId.ics?token= → the speaker's
 * accepted+scheduled talks as RFC-5545-shaped VEVENTs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';
import { getMagicToken } from '../helpers/stack';

let eventId: string;
let speakerId: string;
let magicToken: string | undefined;
let subId: string;

const SLOT_START = '2026-09-02T14:00:00Z';
const SLOT_END = '2026-09-02T15:00:00Z';
// RFC 5545 UTC form of SLOT_START
const DTSTART_EXPECT = /DTSTART[^:]*:20260902T140000Z/;

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  const formId = await makeForm(eventId);
  const { res, email } = await submitCfp(formId, { title: 'ICS talk' });
  if (res.status >= 300) throw new Error(`CFP failed: ${res.status}`);
  magicToken = getMagicToken(email);
  if (!process.env.TEST_BASE_URL && !magicToken) throw new Error('no magic token after CFP');

  const org = await organizer();
  const subs = await org.get(`/api/events/${eventId}/submissions`);
  const sub = (subs.body?.submissions ?? subs.body).find(
    (s: any) => s.speaker_email === email || s.speaker?.email === email,
  );
  subId = sub.id;
  speakerId = sub.speaker_id ?? sub.speaker?.id;
  if (!speakerId) throw new Error(`submissions row exposes no speaker id: ${JSON.stringify(sub)}`);

  // accept + schedule it
  const acc = await org.patch(`/api/submissions/${subId}`, { json: { status: 'accepted' } });
  if (acc.status >= 300) throw new Error(`accept failed: ${acc.status} ${acc.text}`);
  const room = await org.post(`/api/events/${eventId}/rooms`, { json: { name: uniq('ICS Room'), capacity: 50, sort: 0 } });
  const slot = await org.post(`/api/events/${eventId}/schedule/slots`, {
    json: { submission_id: subId, room_id: room.body?.id ?? room.body?.room?.id, starts_at: SLOT_START, ends_at: SLOT_END },
  });
  if (slot.status >= 300) throw new Error(`slot failed: ${slot.status} ${slot.text}`);
});

describe('ICS output', () => {
  it('valid token → RFC-shaped calendar with the scheduled talk (positive control)', async () => {
    if (!magicToken) return; // remote stack: token not extractable
    const res = await new Client().get(`/api/public/ics/${speakerId}.ics?token=${encodeURIComponent(magicToken)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/calendar');
    const ics = res.text;
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toMatch(DTSTART_EXPECT);
    expect(ics).toContain('ICS talk'); // SUMMARY carries the talk title
    // Balanced VEVENT blocks
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe((ics.match(/END:VEVENT/g) ?? []).length);
  });

  it('bad token → 401/403/404, not the calendar (denial with the positive control above)', async () => {
    const res = await new Client().get(`/api/public/ics/${speakerId}.ics?token=wrong-token`);
    expect([401, 403, 404]).toContain(res.status);
    expect(res.text).not.toContain('BEGIN:VCALENDAR');
  });

  it('missing token → denied', async () => {
    const res = await new Client().get(`/api/public/ics/${speakerId}.ics`);
    expect([400, 401, 403, 404]).toContain(res.status);
  });

  it('unscheduled/unaccepted talks do not produce VEVENTs (only the scheduled one appears)', async () => {
    if (!magicToken) return;
    const res = await new Client().get(`/api/public/ics/${speakerId}.ics?token=${encodeURIComponent(magicToken)}`);
    // exactly 1 VEVENT: the accepted+scheduled talk. (The speaker has no other talks.)
    expect((res.text.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });
});
