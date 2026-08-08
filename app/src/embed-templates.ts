// Server-rendered public embed pages (CONTRACTS pinned decision #6).
// Pure template functions — no React, no runtime deps, zero client JS.
// The Hono backend imports these and serves them at /embed/speakers/:slug and
// /embed/schedule/:slug:
//
//   import { renderSpeakersEmbed, renderScheduleEmbed } from '../../app/src/embed-templates'
//   c.html(renderSpeakersEmbed(data))
//
// Data shapes are exactly the public API responses from CONTRACTS.md.

import type { PublicScheduleItem, PublicScheduleResponse, PublicSpeakersResponse } from './types'

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;')

/** #rrggbb from arbitrary input, else fallback — track colors land in a style attr. */
const safeColor = (s: string | null | undefined, fallback: string) =>
  s && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0}
:root{
  --bg:#f6f7f5;--surface:#fff;--border:#dcdfd8;--text:#1b2420;--muted:#5f6b64;
  --faint:#8b958e;--accent:#0e7a4d;--shadow:0 1px 2px rgb(27 36 32/.06);
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#141815;--surface:#1c211d;--border:#2e362f;--text:#e7ebe7;--muted:#a1aba3;
  --faint:#6f7972;--accent:#3ecf8e;--shadow:0 1px 2px rgb(0 0 0/.3);
}}
body{
  background:var(--bg);color:var(--text);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;padding:20px 14px 32px;
}
.inner{max-width:960px;margin:0 auto}
header{margin-bottom:18px}
h1{font-size:1.25rem;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:.85rem;margin-top:2px}
footer{text-align:center;margin-top:26px;color:var(--faint);font-size:.75rem}
footer a{color:inherit}
.av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;
  background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);
  font-weight:650;overflow:hidden;flex:none}
.av img{width:100%;height:100%;object-fit:cover;display:block}
`

const shell = (title: string, css: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
</head>
<body>
<div class="inner">
${body}
<footer>Powered by <a href="https://github.com/Kaeva-labs" rel="noreferrer">GreenRoom</a></footer>
</div>
</body>
</html>`

const SPEAKERS_CSS = `
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:18px 16px;text-align:center;box-shadow:var(--shadow)}
.card h2{font-size:.98rem;margin-top:10px}
.tagline{color:var(--muted);font-size:.82rem;margin-top:3px}
.company{color:var(--accent);font-size:.78rem;font-weight:600;margin-top:5px}
.bio{color:var(--muted);font-size:.8rem;margin-top:8px;text-align:left}
details summary{cursor:pointer;color:var(--accent);font-size:.78rem;margin-top:8px;list-style:none}
details summary::-webkit-details-marker{display:none}
`

export function renderSpeakersEmbed(data: PublicSpeakersResponse): string {
  const cards = data.speakers.map((s) => `
  <article class="card">
    <div style="display:flex;justify-content:center">
      <span class="av" style="width:72px;height:72px;font-size:27px">${
        s.headshot_url
          ? `<img src="${esc(s.headshot_url)}" alt="${esc(s.name)}" loading="lazy">`
          : esc(initials(s.name))
      }</span>
    </div>
    <h2>${esc(s.name)}</h2>
    ${s.tagline ? `<p class="tagline">${esc(s.tagline)}</p>` : ''}
    ${s.company ? `<p class="company">${esc(s.company)}</p>` : ''}
    ${s.bio ? `<details><summary>About</summary><p class="bio">${esc(s.bio)}</p></details>` : ''}
  </article>`).join('')

  return shell(`Speakers — ${data.event.name}`, SPEAKERS_CSS, `
<header>
  <h1>Speakers</h1>
  <p class="sub">${esc(data.event.name)} · ${data.speakers.length} confirmed</p>
</header>
<div class="grid">${cards}</div>`)
}

const SCHEDULE_CSS = `
.day{margin-bottom:22px}
.day>h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  margin-bottom:10px;position:sticky;top:0;background:var(--bg);padding:6px 0;z-index:2}
.slot{display:grid;grid-template-columns:86px 1fr;gap:12px;background:var(--surface);
  border:1px solid var(--border);border-left:4px solid var(--track,var(--border));
  border-radius:9px;padding:10px 14px;margin-bottom:8px;box-shadow:var(--shadow)}
.slot.break{background:transparent;border-style:dashed;box-shadow:none}
.when{font-variant-numeric:tabular-nums;color:var(--muted);font-size:.8rem;padding-top:2px}
.when .room{display:block;color:var(--faint);font-size:.72rem;margin-top:2px}
h3{font-size:.95rem}
.spk{display:flex;align-items:center;gap:8px;margin-top:6px;color:var(--muted);font-size:.82rem}
.pill{display:inline-block;font-size:.7rem;font-weight:650;padding:0 8px;border-radius:999px;
  color:#fff;margin-left:8px;vertical-align:2px;line-height:1.7}
`

export function renderScheduleEmbed(data: PublicScheduleResponse): string {
  const tz = data.event.timezone
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const dayTitle = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const byDay = new Map<string, PublicScheduleItem[]>()
  for (const it of data.items) {
    const k = dayOf(it.starts_at)
    byDay.set(k, [...(byDay.get(k) ?? []), it])
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, items]) => {
    const rows = items
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (a.room ?? '').localeCompare(b.room ?? ''))
      .map((it) => `
    <article class="slot${it.kind !== 'talk' ? ' break' : ''}"${
        it.track_color ? ` style="--track:${safeColor(it.track_color, 'var(--border)')}"` : ''}>
      <div class="when">${timeOf(it.starts_at)}<br><span style="color:var(--faint)">–${timeOf(it.ends_at)}</span>
        ${it.room ? `<span class="room">${esc(it.room)}</span>` : ''}
      </div>
      <div>
        <h3>${esc(it.title)}${
          it.track && it.kind === 'talk'
            ? `<span class="pill" style="background:${safeColor(it.track_color, '#5f6b64')}">${esc(it.track)}</span>`
            : ''}</h3>
        ${it.speaker ? `
        <div class="spk">
          <span class="av" style="width:22px;height:22px;font-size:9px">${
            it.speaker.headshot_url
              ? `<img src="${esc(it.speaker.headshot_url)}" alt="" loading="lazy">`
              : esc(initials(it.speaker.name))
          }</span>
          <span><strong>${esc(it.speaker.name)}</strong>${
            it.speaker.tagline ? `<span style="color:var(--faint)"> — ${esc(it.speaker.tagline)}</span>` : ''}</span>
        </div>` : ''}
      </div>
    </article>`).join('')
    return `<section class="day"><h2>${dayTitle(day)}</h2>${rows}</section>`
  }).join('')

  return shell(`Schedule — ${data.event.name}`, SCHEDULE_CSS, `
<header>
  <h1>Schedule</h1>
  <p class="sub">${esc(data.event.name)} · all times ${esc(tz.replace(/_/g, ' '))}</p>
</header>
${days || '<p style="color:var(--muted);text-align:center">Schedule coming soon.</p>'}`)
}
