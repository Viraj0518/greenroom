/**
 * Test stack lifecycle: boots `wrangler pages dev` with a fresh local D1
 * (migrations + seed applied) unless TEST_BASE_URL points at an already-running stack.
 *
 * Used as vitest globalSetup (see tests/vitest.config.ts).
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { rmSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..', '..');
const STATE_DIR = join(ROOT, 'tests', '.state');
const PORT = Number(process.env.TEST_PORT ?? 8788);
export const BASE_URL = process.env.TEST_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const D1_NAME = process.env.D1_NAME ?? 'greenroom-db';
// Static dir served by pages dev: the Vite build output (wrangler.toml
// pages_build_output_dir = "dist"), else a stub dir so API tests run unbuilt.
const STATIC_DIR = existsSync(join(ROOT, 'dist')) ? 'dist' : 'tests/.static-stub';

let child: ChildProcess | undefined;

function wrangler(args: string[]) {
  execFileSync('pnpm', ['exec', 'wrangler', ...args], { cwd: ROOT, stdio: 'inherit' });
}

function applyDb() {
  const migrationsDir = join(ROOT, 'db', 'migrations');
  if (existsSync(migrationsDir)) {
    wrangler(['d1', 'migrations', 'apply', D1_NAME, '--local', '--persist-to', STATE_DIR]);
  } else {
    // Fallback: apply any .sql files in db/ in name order (schema before seed).
    const dbDir = join(ROOT, 'db');
    if (!existsSync(dbDir)) throw new Error('db/ not found — data session has not landed schema yet');
    for (const f of readdirSync(dbDir).filter((f) => f.endsWith('.sql')).sort()) {
      wrangler(['d1', 'execute', D1_NAME, '--local', '--persist-to', STATE_DIR, '--file', join('db', f)]);
    }
    return;
  }
  const seed = join(ROOT, 'db', 'seed.sql');
  if (existsSync(seed)) {
    wrangler(['d1', 'execute', D1_NAME, '--local', '--persist-to', STATE_DIR, '--file', 'db/seed.sql']);
  }
}

async function waitForReady(url: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { redirect: 'manual' }); // any HTTP response (even 404) = server is up
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Stack at ${url} not ready within ${timeoutMs}ms: ${lastErr}`);
}

export async function setup() {
  if (process.env.TEST_BASE_URL) {
    // External stack (e.g. CI started it, or staging): assume it is prepared.
    await waitForReady(BASE_URL);
    return;
  }
  rmSync(STATE_DIR, { recursive: true, force: true });
  mkdirSync(join(ROOT, 'tests', '.static-stub'), { recursive: true });
  applyDb();
  child = spawn(
    'pnpm',
    ['exec', 'wrangler', 'pages', 'dev', STATIC_DIR, '--port', String(PORT), '--persist-to', STATE_DIR],
    { cwd: ROOT, stdio: 'inherit' },
  );
  child.on('exit', (code) => {
    if (code !== null && code !== 0) console.error(`[stack] wrangler exited with code ${code}`);
  });
  await waitForReady(BASE_URL);
}

export async function teardown() {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));
    if (!child.killed) child.kill('SIGKILL');
  }
}

/**
 * Fixture extraction only (NOT an API under test): magic tokens are deliberately
 * never exposed by the API, so tests read them from the local D1 the stack runs on.
 * Unavailable when TEST_BASE_URL points at a remote stack — tests that need a token
 * skip in that mode.
 */
export function getMagicToken(email: string): string | undefined {
  if (process.env.TEST_BASE_URL) return undefined;
  const out = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', D1_NAME, '--local', '--persist-to', STATE_DIR, '--json',
     '--command', `SELECT magic_token FROM speakers WHERE email = '${email.replace(/'/g, "''")}'`],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const parsed = JSON.parse(out);
  return parsed?.[0]?.results?.[0]?.magic_token;
}
