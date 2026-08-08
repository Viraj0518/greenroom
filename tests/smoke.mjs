#!/usr/bin/env node
/**
 * Deployed-site smoke test. Run after every Pages deploy:
 *
 *   node tests/smoke.mjs https://greenroom-dev.pages.dev
 *
 * Read-mostly: the only mutation is one CFP submit with a throwaway
 * @smoke.greenroom.test address, and only when a seeded/discoverable form exists.
 * Exit 0 = all critical paths OK; exit 1 = failures (listed).
 */
import { SEED } from './fixtures.mjs';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: node tests/smoke.mjs <deployed-base-url>');
  process.exit(2);
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✅ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: String(e?.message ?? e) });
    console.log(`  ❌ ${name}\n     ${String(e?.message ?? e)}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function get(path, headers = {}) {
  const res = await fetch(base + path, { headers, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

console.log(`Smoke-testing ${base}\n`);

await check('app shell: GET / serves HTML', async () => {
  const r = await get('/');
  assert(r.status === 200, `status ${r.status}`);
  assert((r.headers.get('content-type') ?? '').includes('text/html'), `content-type ${r.headers.get('content-type')}`);
  assert(r.text.length > 200, 'suspiciously empty page');
});

await check('API is alive: /api/auth/me answers 401 (not 404/500/HTML)', async () => {
  const r = await get('/api/auth/me');
  assert(r.status === 401, `expected 401, got ${r.status} — API routing broken?`);
});

await check(`public speakers endpoint: /api/public/events/${SEED.eventSlug}/speakers`, async () => {
  const r = await get(`/api/public/events/${SEED.eventSlug}/speakers`, { origin: 'https://smoke.example' });
  assert(r.status === 200, `status ${r.status}`);
  assert(r.headers.get('access-control-allow-origin') === '*', 'not CORS-open');
  const body = JSON.parse(r.text);
  const speakers = body?.speakers ?? body;
  assert(Array.isArray(speakers), 'not an array');
  assert(speakers.length > 0, 'no seeded speakers — seed missing on this deploy?');
});

await check(`public schedule endpoint: /api/public/events/${SEED.eventSlug}/schedule`, async () => {
  const r = await get(`/api/public/events/${SEED.eventSlug}/schedule`);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.headers.get('access-control-allow-origin') === '*', 'not CORS-open');
});

await check(`embed pages: /embed/speakers/${SEED.eventSlug} + /embed/schedule/${SEED.eventSlug}`, async () => {
  for (const p of [`/embed/speakers/${SEED.eventSlug}`, `/embed/schedule/${SEED.eventSlug}`]) {
    const r = await get(p);
    assert(r.status === 200, `${p}: status ${r.status}`);
    const xfo = r.headers.get('x-frame-options');
    assert(xfo === null || !/deny|sameorigin/i.test(xfo), `${p}: x-frame-options=${xfo} blocks iframing`);
  }
});

await check('negative control: unknown slug 404s (server is not blanket-200)', async () => {
  const r = await get('/api/public/events/no-such-slug-smoke/speakers');
  assert(r.status === 404, `expected 404, got ${r.status}`);
});

if (SEED.published && SEED.formId) {
  await check('CFP submit end-to-end (throwaway speaker)', async () => {
    const email = `smoke-${Date.now()}@smoke.greenroom.test`;
    const res = await fetch(`${base}/api/public/forms/${SEED.formId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        speaker: { email, name: 'Smoke Test' },
        title: 'Smoke submission (ignore)',
        answers: { category: 'Talk', abstract: 'Automated smoke submission — safe to reject.' },
      }),
    });
    assert(res.status < 300, `status ${res.status}: ${await res.text()}`);
  });

  await check('public form spec fetch', async () => {
    const r = await get(`/api/public/forms/${SEED.formId}`);
    assert(r.status === 200, `status ${r.status}`);
  });
} else {
  console.log('  ⚠️  seed fixtures not published yet — skipping CFP submit + form spec checks');
}

if (SEED.published && SEED.speakerId && SEED.speakerToken) {
  await check('ICS feed for seeded speaker', async () => {
    const r = await get(`/api/public/ics/${SEED.speakerId}.ics?token=${encodeURIComponent(SEED.speakerToken)}`);
    assert(r.status === 200, `status ${r.status}`);
    assert(r.text.includes('BEGIN:VCALENDAR') && r.text.includes('BEGIN:VEVENT'), 'not a VEVENT calendar');
  });
  await check('ICS denies a bad token', async () => {
    const r = await get(`/api/public/ics/${SEED.speakerId}.ics?token=wrong`);
    assert([401, 403, 404].includes(r.status), `expected denial, got ${r.status}`);
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
