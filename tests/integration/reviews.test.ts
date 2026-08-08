/**
 * Evaluation workflows: rounds, review queue, scoring, leaderboard math.
 *
 * Leaderboard per pinned contract (coordinator 2026-08-08): { round_id, rows: [...] },
 * per-review total = sum of numeric scores_json values, score = 2dp mean of totals
 * (AI included), null when unreviewed; sort score DESC nulls last, tie-break title ASC.
 * One review per reviewer per round (upsert on re-review).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { makeEvent, makeForm, submitCfp, organizer, Client, uniq } from '../helpers/api';

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
  const c = await submitCfp(formId, { title: 'Never reviewed talk' }); // stays review-free: exercises score=null
  if (a.res.status >= 300 || b.res.status >= 300 || c.res.status >= 300) throw new Error('CFP setup failed');
  highSubId = await findSubmissionId(eventId, a.email);
  lowSubId = await findSubmissionId(eventId, b.email);

  const org = await organizer();
  const round = await org.post(`/api/events/${eventId}/rounds`, {
    json: {
      name: 'Round 1', round_no: 1, is_open: 1,
      rubric: { criteria: [{ id: 'clarity', max: 5 }, { id: 'relevance', max: 5 }] },
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
      json: { scores_json: { clarity: 5, relevance: 5 }, comment: 'Excellent' },
    });
    expect(r1.status).toBeLessThan(300);
    const r2 = await org.post(`/api/rounds/${roundId}/submissions/${lowSubId}/review`, {
      json: { scores_json: { clarity: 1, relevance: 2 }, comment: 'Weak' },
    });
    expect(r2.status).toBeLessThan(300);

    // Pinned shape (coordinator 2026-08-08): { round_id, rows: [{ submission_id, title,
    // category, track, speaker_name, review_count, ai_review_count, score }] };
    // per-review total = sum of numeric scores_json values; score = mean of totals, 2dp;
    // sort score DESC nulls last, tie-break title ASC.
    const lb = await org.get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    expect(lb.status).toBe(200);
    expect(lb.body?.round_id).toBe(roundId);
    const rows: any[] = lb.body?.rows;
    expect(Array.isArray(rows), `pinned contract requires rows[]: ${lb.text.slice(0, 300)}`).toBe(true);

    const high = rows.find((r) => r.submission_id === highSubId);
    const low = rows.find((r) => r.submission_id === lowSubId);
    expect(high, 'high-scored submission missing from leaderboard').toBeTruthy();
    expect(low, 'low-scored submission missing from leaderboard').toBeTruthy();

    // exact math: one review each; high total = 5+5 = 10, low total = 1+2 = 3
    expect(high.score).toBe(10);
    expect(low.score).toBe(3);
    expect(high.review_count).toBe(1);
    expect(low.review_count).toBe(1);
    expect(high.title).toBe('Strong talk');
    expect(typeof high.speaker_name).toBe('string');

    // sort: score DESC → high strictly before low
    expect(rows.indexOf(high)).toBeLessThan(rows.indexOf(low));
  });

  it('score is the 2dp mean of per-review totals across multiple REVIEWERS', async () => {
    // Reviews upsert on (round, submission, reviewer), so a second data point
    // requires a second reviewer: admin-created via POST /auth/register.
    const org = await organizer();
    const email = `${uniq('reviewer')}@greenroom.test`;
    const reg = await org.post('/api/auth/register', {
      json: { email, name: 'Second Reviewer', password: 'reviewer-pass-123' },
    });
    expect(reg.status).toBeLessThan(300);
    const rev = new Client();
    const login = await rev.post('/api/auth/login', { json: { email, password: 'reviewer-pass-123' } });
    expect(login.status).toBe(200);

    // second reviewer: total 1+1=2 → mean of [3, 2] = 2.5
    const r = await rev.post(`/api/rounds/${roundId}/submissions/${lowSubId}/review`, {
      json: { scores_json: { clarity: 1, relevance: 1 }, comment: 'Second look' },
    });
    expect(r.status).toBeLessThan(300);
    const lb = await org.get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    const low = lb.body?.rows?.find((x: any) => x.submission_id === lowSubId);
    expect(low?.review_count).toBe(2);
    expect(low?.score).toBe(2.5);
  });

  it('re-review by the SAME reviewer replaces their score (upsert), not a new data point', async () => {
    const org = await organizer();
    // admin's original low review was {1,2}=3; replace with {4,1}=5 → mean of [5, 2] = 3.5
    const r = await org.post(`/api/rounds/${roundId}/submissions/${lowSubId}/review`, {
      json: { scores_json: { clarity: 4, relevance: 1 }, comment: 'Revised' },
    });
    expect(r.status).toBeLessThan(300);
    const lb = await org.get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    const low = lb.body?.rows?.find((x: any) => x.submission_id === lowSubId);
    expect(low?.review_count).toBe(2); // still two reviewers
    expect(low?.score).toBe(3.5);
  });

  it('a submission with zero reviews has score null and sorts last (nulls last)', async () => {
    const org = await organizer();
    const lb = await org.get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    const rows: any[] = lb.body?.rows ?? [];
    const unreviewed = rows.filter((r) => r.review_count === 0);
    expect(unreviewed.length, 'expected the never-reviewed submission on the leaderboard').toBeGreaterThanOrEqual(1);
    for (const u of unreviewed) expect(u.score).toBeNull();
    const scored = rows.filter((r) => r.review_count > 0);
    const lastScoredIdx = Math.max(...scored.map((r) => rows.indexOf(r)));
    const firstNullIdx = Math.min(...unreviewed.map((r) => rows.indexOf(r)));
    expect(firstNullIdx).toBeGreaterThan(lastScoredIdx);
  });

  it('scores_json as a JSON STRING is rejected (pin #5: object form only)', async () => {
    const org = await organizer();
    const res = await org.post(`/api/rounds/${roundId}/submissions/${highSubId}/review`, {
      json: { scores_json: JSON.stringify({ clarity: 3 }), comment: 'string shape' },
    });
    expect(res.status).toBe(400);
  });

  it('leaderboard requires organizer auth → 401 without cookie', async () => {
    const res = await new Client().get(`/api/events/${eventId}/leaderboard?round=${roundId}`);
    expect(res.status).toBe(401);
  });

  it('ai-review without ANTHROPIC_API_KEY → 501 ai_not_configured (deliberate, not a crash)', async () => {
    const org = await organizer();
    const res = await org.post(`/api/rounds/${roundId}/submissions/${highSubId}/ai-review`);
    if (process.env.ANTHROPIC_API_KEY) {
      expect(res.status).toBeLessThan(300); // configured stacks must actually review
    } else {
      expect(res.status).toBe(501);
      expect(res.body?.code).toBe('ai_not_configured');
    }
  });
});
