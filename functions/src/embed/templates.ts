// Default server-rendered embed templates (pin #6: inline CSS, zero JS, iframe-safe).
//
// HANDOFF CONTRACT with UI (tenzinyeshi-07): UI owns markup/styles. Their versions live in
// app/src/embeds/templates.ts exporting the same two functions with the same signatures;
// once that file lands, functions/src/embed/index.ts flips its import from './templates'
// to the app/ path. These defaults keep the routes shippable until then.

import type { SpeakersPayload, SchedulePayload, ScheduleSlotView } from '../routes/public'

export function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const BASE_CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#e5e5e5;--card:#fafafa;--accent:#0a7d4f}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--muted:#9a9a9a;--line:#2a2a2a;--card:#1a1a1a;--accent:#3ecf8e}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:16px}
h1{font-size:1.15rem;margin-bottom:12px}
h2{font-size:.95rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px}
.muted{color:var(--muted)}
`.trim()

function page(title: string, css: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${BASE_CSS}\n${css}</style>
</head>
<body>
${body}
</body>
</html>`
}

export function renderSpeakersEmbed(data: SpeakersPayload): string {
  const css = `
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px}
.avatar{width:64px;height:64px;border-radius:50%;object-fit:cover;background:var(--line)}
.avatar-fallback{width:64px;height:64px;border-radius:50%;background:var(--line);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:1.3rem;color:var(--muted)}
.name{font-weight:600}
.tagline{font-size:.9rem}
.company{font-size:.85rem;color:var(--muted)}
`.trim()
  const cards = data.speakers
    .map((sp) => {
      const avatar = sp.headshot_url
        ? `<img class="avatar" src="${esc(sp.headshot_url)}" alt="" loading="lazy">`
        : `<div class="avatar-fallback" aria-hidden="true">${esc(sp.name.slice(0, 1).toUpperCase())}</div>`
      return `<div class="card">
${avatar}
<div class="name">${esc(sp.name)}</div>
${sp.tagline ? `<div class="tagline">${esc(sp.tagline)}</div>` : ''}
${sp.company ? `<div class="company">${esc(sp.company)}</div>` : ''}
</div>`
    })
    .join('\n')
  const body = `<h1>${esc(data.event.name)} — Speakers</h1>
${data.speakers.length ? `<div class="grid">${cards}</div>` : '<p class="muted">Speakers will be announced soon.</p>'}`
  return page(`${data.event.name} — Speakers`, css, body)
}

function slotTime(iso: string): string {
  return iso.slice(11, 16)
}

export function renderScheduleEmbed(data: SchedulePayload): string {
  const css = `
.day{margin-bottom:20px}
.slot{display:flex;gap:12px;border-top:1px solid var(--line);padding:10px 0}
.time{flex:0 0 92px;font-variant-numeric:tabular-nums;color:var(--muted);font-size:.9rem}
.title{font-weight:600}
.meta{font-size:.85rem;color:var(--muted)}
.badge{display:inline-block;font-size:.75rem;border:1px solid var(--line);border-radius:999px;padding:0 8px;margin-left:6px;vertical-align:1px}
.track-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:0}
`.trim()
  const roomName = new Map(data.rooms.map((r) => [r.id, r.name]))
  const trackOf = new Map(data.tracks.map((t) => [t.id, t]))

  const renderSlot = (s: ScheduleSlotView): string => {
    const track = s.track_id ? trackOf.get(s.track_id) : undefined
    const room = s.room_id ? roomName.get(s.room_id) : undefined
    const dot = track?.color ? `<span class="track-dot" style="background:${esc(track.color)}"></span>` : ''
    const metaBits = [s.speaker ? esc(s.speaker) + (s.speaker_company ? ` · ${esc(s.speaker_company)}` : '') : '', track ? esc(track.name) : '']
      .filter(Boolean)
      .join(' — ')
    return `<div class="slot">
<div class="time">${slotTime(s.starts_at)}–${slotTime(s.ends_at)}</div>
<div>
<div class="title">${dot}${esc(s.title)}${room ? `<span class="badge">${esc(room)}</span>` : ''}</div>
${metaBits ? `<div class="meta">${metaBits}</div>` : ''}
</div>
</div>`
  }

  const daysHtml = data.days
    .map(
      (d) => `<section class="day">
<h2>${esc(d.date)}</h2>
${d.slots.map(renderSlot).join('\n')}
</section>`
    )
    .join('\n')
  const tz = data.event.timezone ? `<p class="muted" style="font-size:.8rem">All times UTC (event timezone: ${esc(data.event.timezone)})</p>` : ''
  const body = `<h1>${esc(data.event.name)} — Schedule</h1>
${data.days.length ? daysHtml : '<p class="muted">The schedule will be published soon.</p>'}
${tz}`
  return page(`${data.event.name} — Schedule`, css, body)
}
