// CONTRACTS.md pin #6: initial SPA JS must stay <= 150 KB gzipped.
// Sums the gzipped size of every script the built index.html actually loads.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const LIMIT_KB = 150
const dist = join(process.cwd(), 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')

const refs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
if (refs.length === 0) {
  console.error('check-bundle-size: no JS references found in dist/index.html — did the build run?')
  process.exit(1)
}

let total = 0
for (const ref of refs) {
  const gz = gzipSync(readFileSync(join(dist, ref))).length
  total += gz
  console.log(`  ${ref}: ${(gz / 1024).toFixed(1)} KB gzip`)
}

const totalKb = total / 1024
console.log(`initial JS total: ${totalKb.toFixed(1)} KB gzip (limit ${LIMIT_KB} KB)`)
if (totalKb > LIMIT_KB) {
  console.error(`check-bundle-size: FAIL — over the ${LIMIT_KB} KB pin #6 budget`)
  process.exit(1)
}
