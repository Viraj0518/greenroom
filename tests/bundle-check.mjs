#!/usr/bin/env node
/**
 * Pin #6 build gate: initial SPA JS (scripts referenced by dist/index.html),
 * gzipped, must total <= 150 KB. Run after `pnpm build`:
 *
 *   node tests/bundle-check.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUDGET = 150 * 1024;

const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) {
  console.error('dist/index.html not found — run `pnpm build` first');
  process.exit(2);
}
const html = readFileSync(indexPath, 'utf8');
const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
if (srcs.length === 0) {
  console.error('no <script src> found in dist/index.html — nothing to measure (is the build real?)');
  process.exit(1);
}

let total = 0;
for (const src of srcs) {
  const file = join(DIST, src.replace(/^\//, ''));
  if (!existsSync(file)) {
    console.error(`referenced script missing from dist: ${src}`);
    process.exit(1);
  }
  const gz = gzipSync(readFileSync(file)).length;
  total += gz;
  console.log(`  ${src}: ${(gz / 1024).toFixed(1)} KB gzip`);
}
console.log(`\ninitial JS total: ${(total / 1024).toFixed(1)} KB gzip (budget ${(BUDGET / 1024).toFixed(0)} KB)`);
if (total > BUDGET) {
  console.error('FAIL: over the pin #6 budget');
  process.exit(1);
}
console.log('OK');
