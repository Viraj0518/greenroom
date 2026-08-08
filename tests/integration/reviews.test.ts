/**
 * Evaluation workflows: rounds, review queue, scoring, leaderboard math.
 *
 * Leaderboard aggregation formula is not pinned in CONTRACTS.md yet (flagged to
 * coordinator). These tests assert what any sane aggregation must satisfy:
 * a submission scored strictly higher by every reviewer ranks strictly above one
 * scored lower, and both appear with a numeric aggregate.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client } from '../helpers/api';

let eventId: string;
let roundId: string;
let highSubId: string;
let lowSubId: string;

async function findSubmissionId(eventId: string, email: string): Promise<string> {
  const org = await organizer();
  const subs = await org.get(`/api/events/${eventId}/submissions`);
  const list = subs.body?.submissions ?? subs.body;
  const s = list.find((s: any) => s.speaker_email === email || s.speaker?.email === email);
  if (!s) throw new Error(`submission for ${email} not found`);
  return s.id;
}

beforeAll(async () => {
  ({ eventId } = await makeEvent());
  const formId = await makeForm(eventId);
  const a = await submitCfp(formId, { title: 'Strong talk' });
  const b = await submitCfp(formId, { title: 'Weak talk' });
  if (a.res.status >= 300 || b.res.status >= 300) throw new Error('CFP setup failed');
  highSubId = await findSubmissionId(eventId, a.email);
  lowSubId = await findSubmissionId(eventId, b.email);

  const org = await organizer();
  const round = await org.post(`/api/events/${eventId}/rounds`, {
    json: {
      name: 'Round 1', round_no: 1, is_open: 1,
      rubric_json: JSON.stringify({ criteria: [{ id: 'clarity', max: 5 }, { id: 'relevance', max: 5 }] }),
    },
  });
  if (round.status >= 400) throw new Error(`round creation failed: ${round.status} ${round.text}`);
  roundId = round.body?.id ?? round.body?.round?.id;
});

describe('rounds & queue', () => {
  it('GET /api/events/:eventId/rounds lists the created round (positive control)', async () => {
    const org = await organizer();
    const res = await org.get(`/api/events/${eventId}/rounds`);
    expect(res.status).toBe(200);
    const rounds = res.body?.rounds ?? res.body;
    expect(rounds.some((r: any) => r.id === roundId)).toBe(true);
  });

  it('rounds route without auth → 401', async () => {
    const res = await new Client().get(`/api/events/${eventId}/rounds`);
    expect(res.status).toBe(401);
  });

  it('queue returns both submissions', async () => {
    const org = await organizer();
    const res = await org.get(`/api/rounds/${roundId}/queue`);
    expect(res.status).toBe(200);
    const queue = res.body?.queue ?? res.body?.submissions ?? res.body;
    const ids = queue.map((q: any) => q.id ?? q.submission?.id ?? q.submission_id);
    expect(ids).toContain(highSubId);
    expect(ids).toContain(lowSubId);
  });
});

describe('scoring + leaderboard math', () => {
  it('reviews post successfully and the leaderboard ranks high above low', async () => {
    const org = await organizer();
    const r1 = await org.post(`/api/rounds/${roundId}/submissions/${highSubId}/review`, {
      json: { scores_json: JSON.stringify({ clarity: 5, relevance: 5 }), comment: 'Excellent' },
    });
    expect(r1.status).toBeLessThan(300);
    const r2 = await org.post(`/api/rounds/${roundId}/submissions/${lowSubId}/review`, {
      json: { scores_json: JSON.stringify({ clarity: 1, relevance: 2 }), comment: 'Weak' },
    });
    expect(r2.status).toBeLessThan(300);

    const lb = await org.get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    expect(lb.status).toBe(200);
    const rows: any[] = lb.body?.leaderboard ?? lb.body?.entries ?? lb.body;
    expect(Array.isArray(rows)).toBe(true);

    const rowOf = (id: string) => rows.find((r) => (r.submission_id ?? r.id ?? r.submission?.id) === id);
    const high = rowOf(highSubId);
    const low = rowOf(lowSubId);
    expect(high, 'high-scored submission missing from leaderboard').toBeTruthy();
    expect(low, 'low-scored submission missing from leaderboard').toBeTruthy();

    const scoreOf = (r: any) => Number(r.score ?? r.total ?? r.avg ?? r.average ?? NaN);
    expect(Number.isFinite(scoreOf(high)), `no numeric aggregate on leaderboard row: ${JSON.stringify(high)}`).toBe(true);
    expect(scoreOf(high)).toBeGreaterThan(scoreOf(low));

    // Ordering: high must come before low if the endpoint returns sorted rows
    expect(rows.indexOf(high)).toBeLessThan(rows.indexOf(low));
  });

  it('leaderboard requires organizer auth → 401 without cookie', async () => {
    const res = await new Client().get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    expect(res.status).toBe(401);
  });

  it('ai-review without ANTHROPIC_API_KEY → graceful "not configured", not a 500', async () => {
    const org = await organizer();
    const res = await org.post(`/api/rounds/${roundId}/submissions/${highSubId}/ai-review`);
    // Graceful degradation per PLAN.md: any deliberate 4xx/2xx-with-notice is fine; a crash is not.
    expect(res.status).not.toBe(500);
  });
});
