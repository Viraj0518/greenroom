// Server-rendered public embed pages (pin #6) — inline CSS, zero JS, iframe-safe,
// same 60s cache budget as the public JSON they mirror.
//
// Template source of truth: UI (tenzinyeshi-07) owns markup/styles. When their
// app/src/embeds/templates.ts lands, flip this import to
//   import { renderSpeakersEmbed, renderScheduleEmbed } from '../../../app/src/embeds/templates'
// (signatures are pinned in ./templates.ts).

import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { CACHE_60, loadSpeakersPayload, loadSchedulePayload } from '../routes/public'
import { renderSpeakersEmbed, renderScheduleEmbed } from './templates'

const embeds = new Hono<AppEnv>()

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': CACHE_60,
  // Explicitly iframe-friendly: no X-Frame-Options, CORP relaxed for cross-origin iframes.
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

embeds.get('/embed/speakers/:slug', async (c) => {
  const payload = await loadSpeakersPayload(c.env.DB, c.req.param('slug'))
  return c.html(renderSpeakersEmbed(payload), 200, HTML_HEADERS)
})

embeds.get('/embed/schedule/:slug', async (c) => {
  const payload = await loadSchedulePayload(c.env.DB, c.req.param('slug'))
  return c.html(renderScheduleEmbed(payload), 200, HTML_HEADERS)
})

export default embeds
