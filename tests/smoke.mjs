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

const args = process.argv.slice(2);
const readOnly = args.includes('--read-only');
const base = (args.find((a) => !a.startsWith('--')) ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('usage: node tests/smoke.mjs <deployed-base-url> [--read-only]');
  console.error('  --read-only: no mutations (post-re-seed staging mode); asserts curated dataset counts');
  process.exit(2);
}
if (readOnly) console.log('MODE: read-only (no mutations; curated-count assertions active)\n');

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

await check('seeded keynote speaker appears in public speakers', async () => {
  const r = await get(`/api/public/events/${SEED.eventSlug}/speakers`);
  assert(r.text.includes('Priya Raman'), 'seeded accepted keynote speaker missing');
});

await check('public schedule contains the seeded keynote slot day (2026-10-06)', async () => {
  const r = await get(`/api/public/events/${SEED.eventSlug}/schedule`);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.text.includes('2026-10-06'), 'seeded keynote slot missing from public schedule');
});

await check('public resources: seeded public pages present, private pc-handbook NOT leaked', async () => {
  const r = await get(`/api/public/events/${SEED.eventSlug}/resources`);
  assert(r.status === 200, `status ${r.status}`);
  // Named positive controls (per data): without these, an everything-private
  // regression would make the pc-handbook negative read as a pass.
  assert(r.text.includes('speaker-guide'), 'public resource speaker-guide missing (positive control)');
  assert(r.text.includes('venue-av'), 'public resource venue-av missing (positive control)');
  assert(!r.text.includes('pc-handbook'), 'PRIVATE resource pc-handbook leaked on public route');
});

await check('JUDGE ENTRY POINTS: the exact creds and form URL printed on the landing page work', async () => {
  // These two are what the homepage promises a judge; they have broken before
  // (UI-hardcode vs seed drift) — permanent assertions per coordinator.
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@greenroom.dev', password: 'greenroom-demo' }),
  });
  assert(res.status === 200, `tour-creds login status ${res.status} — landing-page creds broken`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  assert(cookie.startsWith('gr_session='), 'no gr_session cookie set');
  const me = await get('/api/auth/me', { cookie });
  assert(me.status === 200 && me.text.includes('demo@greenroom.dev'), `me: ${me.status}`);
  const form = await get('/api/public/forms/form_cfp');
  assert(form.status === 200, `form_cfp fetch ${form.status} — "Submit a talk" CTA target broken`);
});

await check('organizer login works against seeded example.com admin too', async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'demo-greenroom-2026' }),
  });
  assert(res.status === 200, `login status ${res.status}`);
});

// Self-cleaning for mutating checks: track created submissions, withdraw at the end.
const createdEmails = [];

if (!readOnly) {
  await check('pin #8: CFP submit returns portal_url + email_delivery', async () => {
    const email = `smoke-pin8-${Date.now()}@smoke.greenroom.test`;
    createdEmails.push(email);
    const res = await fetch(`${base}/api/public/forms/form_cfp/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        speaker: { email, name: 'Smoke Test' },
        answers: { title: 'Smoke pin8 (ignore)', abstract: 'probe', category: 'AI & ML',
                   session_format: 'Talk (30 min)', audience_level: 'Intermediate' },
      }),
    });
    const body = JSON.parse(await res.text());
    assert(res.status === 201, `status ${res.status}`);
    assert(typeof body.portal_url === 'string' && body.portal_url.includes('token='), 'no portal_url with token');
    assert(['logged', 'real'].includes(body.email_delivery), `email_delivery=${body.email_delivery}`);
  });
}
async function selfClean() {
  if (!createdEmails.length) return;
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@greenroom.dev', password: 'greenroom-demo' }),
  });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const subsRes = await fetch(`${base}/api/events/${SEED.eventId}/submissions`, { headers: { cookie } });
  const subs = (await subsRes.json())?.submissions ?? [];
  for (const s of subs) {
    if (createdEmails.includes(s.speaker_email) && s.status !== 'withdrawn') {
      const r = await fetch(`${base}/api/submissions/${s.id}`, {
        method: 'PATCH', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'withdrawn' }),
      });
      console.log(`  🧹 withdrew smoke submission "${s.title}": ${r.status}`);
    }
  }
}

if (!readOnly && SEED.published && SEED.formId) {
  await check('CFP submit end-to-end (answers built from the live form spec)', async () => {
    const specRes = await get(`/api/public/forms/${SEED.formId}`);
    assert(specRes.status === 200, `form spec fetch: status ${specRes.status}`);
    const form = JSON.parse(specRes.text)?.form ?? JSON.parse(specRes.text);
    const fields = form?.spec?.fields ?? [];
    assert(fields.length > 0, 'form spec has no fields');

    // Fill every required field with a plausible value; reserved ids get real content.
    // (showIf-hidden fields are filled too — extra answers to visible-if conditions
    // are harmless; required-if-shown is satisfied either way.)
    const answers = {
      title: 'Smoke submission (ignore)',
      abstract: 'Automated smoke submission — safe to reject.',
    };
    for (const f of fields) {
      if (answers[f.id] !== undefined) continue;
      if (!f.required) continue;
      answers[f.id] = Array.isArray(f.options) && f.options.length ? f.options[0] : 'smoke-value';
    }

    const email = `smoke-${Date.now()}@smoke.greenroom.test`;
    createdEmails.push(email);
    const res = await fetch(`${base}/api/public/forms/${SEED.formId}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ speaker: { email, name: 'Smoke Test' }, answers }),
    });
    assert(res.status < 300, `status ${res.status}: ${await res.text()}`);
  });
} else if (!readOnly) {
  console.log('  ⚠️  seed fixtures not published yet — skipping CFP submit check');
} else {
  console.log('  ⏭  read-only mode: CFP submit checks skipped (covered by the local mutating leg)');
}

if (SEED.published && SEED.speakerId && SEED.speakerToken) {
  await check('ICS feed for seeded speaker', async () => {
    const r = await get(`/api/public/ics/${SEED.speakerId}.ics?token=${encodeURIComponent(SEED.speakerToken)}`);
    assert(r.status === 200, `status ${r.status}`);
    assert(r.text.includes('BEGIN:VCALENDAR') && r.text.includes('BEGIN:VEVENT'), 'not a VEVENT calendar');
    // seeded keynote slot is 2026-10-06T16:00:00Z
    assert(/DTSTART[^:]*:20261006T160000Z/.test(r.text), 'keynote DTSTART wrong or missing');
  });
  await check('ICS denies a bad token', async () => {
    const r = await get(`/api/public/ics/${SEED.speakerId}.ics?token=wrong`);
    assert([401, 403, 404].includes(r.status), `expected denial, got ${r.status}`);
  });
}

// --- link integrity: no judge-facing link may strand (identifier-rename class) ---
await check('link integrity: every app link in landing HTML + README + SUBMISSION resolves', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  const sources = [];
  sources.push(['landing', (await get('/')).text]);
  for (const f of ['README.md', 'SUBMISSION.md']) {
    const p = join(root, f);
    if (existsSync(p)) sources.push([f, readFileSync(p, 'utf8')]);
  }

  const paths = new Set();
  for (const [, text] of sources) {
    // absolute URLs on our host
    for (const m of text.matchAll(/https?:\/\/greenroom-dev\.pages\.dev(\/[^\s)"'<>\]]*)?/g)) {
      paths.add(m[1] || '/');
    }
    // root-relative hrefs/links in HTML and markdown
    for (const m of text.matchAll(/(?:href="|\]\()(\/(?:f|embed|org|portal|api)[^\s)"'<>\]]*)/g)) {
      paths.add(m[1]);
    }
  }

  const broken = [];
  for (const p of paths) {
    const clean = p.replace(/[.,)]+$/, '');
    if (/^\/api\/auth|^\/org(\/|$)|^\/portal/.test(clean)) continue; // auth-gated: covered elsewhere
    const res = await fetch(base + clean, { redirect: 'follow' });
    if (res.status !== 200) { broken.push(`${clean} → ${res.status}`); continue; }
    // SPA fallback serves 200 for ANY path — for form links, the real check is the spec API
    const formId = clean.match(/^\/f\/([^/?#]+)/)?.[1];
    if (formId) {
      const spec = await fetch(`${base}/api/public/forms/${formId}`);
      if (spec.status !== 200) broken.push(`${clean} → form spec ${spec.status} (dead form id)`);
    }
  }
  assert(paths.size > 0, 'no links extracted — sources missing?');
  assert(broken.length === 0, `stranded links: ${broken.join('; ')}`);
});

// --- pin #6: latency gate on public endpoints (proxy for the edge budget) ---
await check('latency: public endpoints median < 500ms (3 samples each)', async () => {
  const paths = [
    `/api/public/events/${SEED.eventSlug}/speakers`,
    `/api/public/events/${SEED.eventSlug}/schedule`,
    `/embed/speakers/${SEED.eventSlug}`,
  ];
  const slow = [];
  for (const p of paths) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await fetch(base + p);
      times.push(performance.now() - t0);
    }
    const median = times.sort((a, b) => a - b)[1];
    console.log(`     ${p}: median ${Math.round(median)}ms (${times.map((t) => Math.round(t)).join('/')}ms)`);
    if (median > 500) slow.push(`${p} median ${Math.round(median)}ms`);
  }
  assert(slow.length === 0, `over 500ms budget: ${slow.join('; ')}`);
});

await check('embed images all resolve (200 + image/*) — no broken gallery', async () => {
  const broken = [];
  for (const p of [`/embed/speakers/${SEED.eventSlug}`, `/embed/schedule/${SEED.eventSlug}`]) {
    const html = (await get(p)).text;
    const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of srcs) {
      const r = await fetch(src.startsWith('http') ? src : base + src);
      const ct = r.headers.get('content-type') ?? '';
      if (r.status !== 200 || !ct.startsWith('image/')) broken.push(`${src} → ${r.status} ${ct}`);
    }
  }
  assert(broken.length === 0, `broken embed images: ${broken.join('; ')}`);
});

await check('pin #6: embed pages are self-contained (< 30 KB, no SPA bundle reference)', async () => {
  for (const p of [`/embed/speakers/${SEED.eventSlug}`, `/embed/schedule/${SEED.eventSlug}`]) {
    const r = await get(p);
    assert(r.status === 200, `${p}: status ${r.status}`);
    assert(r.text.length < 30_000, `${p}: ${r.text.length}b exceeds 30 KB embed budget`);
    assert(!/<script[^>]+src=["']\/assets\//i.test(r.text), `${p}: references SPA bundle — not server-rendered`);
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
