/**
 * Scheduling: rooms/tracks CRUD, conflict detection.
 * Conflict rule (CONTRACTS.md): overlap in same room, or same speaker in overlapping
 * slots → {slotIds, reason}. Includes negative controls: non-overlapping and
 * merely-touching slots must NOT conflict.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';

let eventId: string;
let roomA: string;
let roomB: string;
let subX: string; // submission by speaker X
let subX2: string; // second submission by the SAME speaker X
let subY: string; // submission by speaker Y

async function makeRoom(name: string): Promise<string> {
  const org = await organizer();
  const res = await org.post(`/api/events/${eventId}/rooms`, { json: { name, capacity: 100, sort: 0 } });
  if (res.status >= 400) throw new Error(`room create failed: ${res.status} ${res.text}`);
  return res.body?.id ?? res.body?.room?.id;
}

async function submissionIdFor(email: string, title: string): Promise<string> {
  const org = await organizer();
  const subs = await org.get(`/api/events/${eventId}/submissions`);
  const list = subs.body?.submissions ?? subs.body;
  const s = list.find(
    (s: any) => (s.speaker_email === email || s.speaker?.email === email) && s.title === title,
  );
  if (!s) throw new Error(`no submission titled "${title}" for ${email}`);
  return s.id;
}

async function makeSlot(json: Record<string, unknown>) {
  const org = await organizer();
  return org.post(`/api/events/${eventId}/schedule/slots`, { json });
}

async function getConflicts(): Promise<any[]> {
  const org = await organizer();
  const res = await org.get(`/api/events/${eventId}/schedule`);
  expect(res.status).toBe(200);
  return res.body?.conflicts ?? [];
}

const T = (h: number, m = 0) => `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  const formId = await makeForm(eventId);
  const x = await submitCfp(formId, { title: 'X talk 1' });
  subX = await submissionIdFor(x.email, 'X talk 1');
  const x2 = await submitCfp(formId, { email: x.email, title: 'X talk 2' });
  subX2 = await submissionIdFor(x2.email, 'X talk 2');
  const y = await submitCfp(formId, { title: 'Y talk' });
  subY = await submissionIdFor(y.email, 'Y talk');
  roomA = await makeRoom(uniq('Room A'));
  roomB = await makeRoom(uniq('Room B'));
});

describe('schedule CRUD', () => {
  it('creates a slot and returns it on GET (positive control)', async () => {
    const res = await makeSlot({ submission_id: subX, room_id: roomA, starts_at: T(9), ends_at: T(10) });
    expect(res.status).toBeLessThan(300);
    const org = await organizer();
    const sched = await org.get(`/api/events/${eventId}/schedule`);
    const slots = sched.body?.slots ?? sched.body;
    expect(slots.some((s: any) => s.submission_id === subX)).toBe(true);
  });

  it('schedule routes require organizer auth → 401 without cookie', async () => {
    const res = await new Client().get(`/api/events/${eventId}/schedule`);
    expect(res.status).toBe(401);
  });
});

describe('conflict detection', () => {
  it('non-overlapping slots in the same room → NO conflict (negative control)', async () => {
    // subX 9-10 in roomA exists from the CRUD test; add subY 10:30-11:30 in roomA.
    const res = await makeSlot({ submission_id: subY, room_id: roomA, starts_at: T(10, 30), ends_at: T(11, 30) });
    expect(res.status).toBeLessThan(300);
    expect(await getConflicts()).toEqual([]);
  });

  it('back-to-back slots (end == start) → NO conflict (boundary negative control)', async () => {
    // subX2 (same speaker as subX but a different slot time) — put in roomB right after subY… use a break slot to
    // avoid speaker-overlap noise: kind 'break' with explicit title, no submission.
    const res = await makeSlot({ title: 'Coffee', kind: 'break', room_id: roomA, starts_at: T(11, 30), ends_at: T(12) });
    expect(res.status).toBeLessThan(300);
    expect(await getConflicts()).toEqual([]);
  });

  it('overlapping slots in the SAME room → conflict with both slotIds', async () => {
    // subX2 12:00-13:00 roomA, then a break 12:30-13:30 roomA overlaps it.
    const s1 = await makeSlot({ submission_id: subX2, room_id: roomA, starts_at: T(12), ends_at: T(13) });
    expect(s1.status).toBeLessThan(300);
    const s1id = s1.body?.id ?? s1.body?.slot?.id;
    const s2 = await makeSlot({ title: 'Overlap break', kind: 'break', room_id: roomA, starts_at: T(12, 30), ends_at: T(13, 30) });
    expect(s2.status).toBeLessThan(300);
    const s2id = s2.body?.id ?? s2.body?.slot?.id;

    const conflicts = await getConflicts();
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const hit = conflicts.find((c: any) => c.slotIds?.includes(s1id) && c.slotIds?.includes(s2id));
    expect(hit, `expected a same-room conflict on [${s1id}, ${s2id}]; got ${JSON.stringify(conflicts)}`).toBeTruthy();
    expect(typeof hit.reason).toBe('string');

    // cleanup so later tests start conflict-free
    const org = await organizer();
    await org.delete(`/api/slots/${s2id}`);
    await org.delete(`/api/slots/${s1id}`);
    expect(await getConflicts()).toEqual([]);
  });

  it('SAME speaker in overlapping slots in DIFFERENT rooms → conflict', async () => {
    // speaker X: subX already 9-10 in roomA; schedule subX2 9:30-10:30 in roomB.
    const s = await makeSlot({ submission_id: subX2, room_id: roomB, starts_at: T(9, 30), ends_at: T(10, 30) });
    expect(s.status).toBeLessThan(300);
    const sid = s.body?.id ?? s.body?.slot?.id;

    const conflicts = await getConflicts();
    const hit = conflicts.find((c: any) => c.slotIds?.includes(sid));
    expect(hit, `expected a same-speaker conflict involving ${sid}; got ${JSON.stringify(conflicts)}`).toBeTruthy();

    const org = await organizer();
    await org.delete(`/api/slots/${sid}`);
  });

  it('DIFFERENT speakers overlapping in DIFFERENT rooms → NO conflict (negative control)', async () => {
    // subY 9:15-9:45 in roomB overlaps subX (roomA) in time only — different room, different speaker.
    const s = await makeSlot({ submission_id: subY, room_id: roomB, starts_at: T(9, 15), ends_at: T(9, 45) });
    expect(s.status).toBeLessThan(300);
    const sid = s.body?.id ?? s.body?.slot?.id;
    // subY is also scheduled 10:30-11:30 in roomA (from the negative control above) — no time overlap with 9:15-9:45.
    expect(await getConflicts()).toEqual([]);
    const org = await organizer();
    await org.delete(`/api/slots/${sid}`);
  });

  it('PATCH moving a slot into overlap surfaces the conflict on the mutation response or next GET', async () => {
    const org = await organizer();
    const s = await makeSlot({ title: 'Movable break', kind: 'break', room_id: roomA, starts_at: T(15), ends_at: T(16) });
    const sid = s.body?.id ?? s.body?.slot?.id;
    const s2 = await makeSlot({ title: 'Anchor break', kind: 'break', room_id: roomA, starts_at: T(16), ends_at: T(17) });
    const s2id = s2.body?.id ?? s2.body?.slot?.id;
    expect(await getConflicts()).toEqual([]); // touching only — positive control for the move below

    const moved = await org.patch(`/api/slots/${sid}`, { json: { starts_at: T(16, 30), ends_at: T(17, 30) } });
    expect(moved.status).toBeLessThan(300);
    const conflicts = await getConflicts();
    expect(conflicts.some((c: any) => c.slotIds?.includes(sid) && c.slotIds?.includes(s2id))).toBe(true);

    await org.delete(`/api/slots/${sid}`);
    await org.delete(`/api/slots/${s2id}`);
  });
});
