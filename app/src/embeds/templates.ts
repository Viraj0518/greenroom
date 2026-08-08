// Server-rendered public embed pages (CONTRACTS pinned decision #6).
// Owned by UI (tenzinyeshi-07); imported by the Hono backend from
// functions/src/embed/index.ts and served at /embed/speakers/:slug and
// /embed/schedule/:slug.
//
// Pure template functions: complete self-contained HTML documents — inline
// <style>, zero client JS (bio/abstract expanders are <details>), no external
// fetches, mobile-first, light/dark via prefers-color-scheme. Every data field
// is HTML-escaped here; track colors pass through a strict hex check before
// landing in a style attribute.

import type { SchedulePayload, SpeakersPayload } from '../../../functions/src/routes/public'

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;')

const safeColor = (s: string | null | undefined, fallback: string) =>
  s && /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

const avatar = (name: string, url: string | null, size: number, fontPx: number) =>
  `<span class="av" style="width:${size}px;height:${size}px;font-size:${fontPx}px">${
    url && (url.startsWith('/') || url.startsWith('https://'))
      ? `<img src="${esc(url)}" alt="" loading="lazy">`
      : esc(initials(name))
  }</span>`

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0}
:root{
  --bg:#f6f7f5;--surface:#fff;--border:#dcdfd8;--text:#1b2420;--muted:#5f6b64;
  --faint:#8b958e;--accent:#0e7a4d;--accent-soft:#e0f0e8;--shadow:0 1px 2px rgb(27 36 32/.06);
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#141815;--surface:#1c211d;--border:#2e362f;--text:#e7ebe7;--muted:#a1aba3;
  --faint:#6f7972;--accent:#3ecf8e;--accent-soft:#1d3a2c;--shadow:0 1px 2px rgb(0 0 0/.3);
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
  background:var(--accent-soft);color:var(--accent);font-weight:650;overflow:hidden;flex:none}
.av img{width:100%;height:100%;object-fit:cover;display:block}
details summary{cursor:pointer;color:var(--accent);font-size:.78rem;list-style:none}
details summary::-webkit-details-marker{display:none}
`

const shell = (title: string, css: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS}${css}</style>
</head>
<body>
<div class="inner">
${body}
<footer>Powered by <a href="/" target="_blank" rel="noreferrer">GreenRoom</a></footer>
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
.card details{margin-top:8px}
`

export function renderSpeakersEmbed(data: SpeakersPayload): string {
  const cards = data.speakers.map((s) => `
  <article class="card">
    <div style="display:flex;justify-content:center">${avatar(s.name, s.headshot_url, 72, 27)}</div>
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
${cards ? `<div class="grid">${cards}</div>` : '<p style="color:var(--muted);text-align:center">Speakers coming soon.</p>'}`)
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
.abs{color:var(--muted);font-size:.8rem;margin-top:6px}
.slot details{margin-top:4px}
`

export function renderScheduleEmbed(data: SchedulePayload): string {
  const tz = data.event.timezone || 'UTC'
  const roomName = new Map(data.rooms.map((r) => [r.id, r.name]))
  const trackOf = new Map(data.tracks.map((t) => [t.id, t]))
  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const dayTitle = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const days = data.days.map(({ date, slots }) => {
    const rows = slots.map((sl) => {
      const track = sl.track_id ? trackOf.get(sl.track_id) : undefined
      const color = safeColor(track?.color, '#5f6b64')
      const room = sl.room_id ? roomName.get(sl.room_id) : undefined
      return `
    <article class="slot${sl.kind !== 'talk' ? ' break' : ''}"${
        track ? ` style="--track:${color}"` : ''}>
      <div class="when">${timeOf(sl.starts_at)}<br><span style="color:var(--faint)">–${timeOf(sl.ends_at)}</span>
        ${room ? `<span class="room">${esc(room)}</span>` : ''}
      </div>
      <div>
        <h3>${esc(sl.title)}${
          track && sl.kind === 'talk'
            ? `<span class="pill" style="background:${color}">${esc(track.name)}</span>` : ''}</h3>
        ${sl.speaker ? `
        <div class="spk">${avatar(sl.speaker, null, 22, 9)}
          <span><strong>${esc(sl.speaker)}</strong>${
            sl.speaker_company ? `<span style="color:var(--faint)"> — ${esc(sl.speaker_company)}</span>` : ''}</span>
        </div>` : ''}
        ${sl.abstract ? `<details><summary>Abstract</summary><p class="abs">${esc(sl.abstract)}</p></details>` : ''}
      </div>
    </article>`
    }).join('')
    return `<section class="day"><h2>${dayTitle(date)}</h2>${rows}</section>`
  }).join('')

  return shell(`Schedule — ${data.event.name}`, SCHEDULE_CSS, `
<header>
  <h1>Schedule</h1>
  <p class="sub">${esc(data.event.name)} · all times ${esc(tz.replace(/_/g, ' '))}</p>
</header>
${days || '<p style="color:var(--muted);text-align:center">Schedule coming soon.</p>'}`)
}
