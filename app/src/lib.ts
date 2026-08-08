import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/** Render Markdown to sanitized HTML. */
export function md(src: string): string {
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw)
}

/** Render trusted organizer-authored embed HTML (resources.embed_html). */
export function embedHtml(src: string): string {
  return DOMPurify.sanitize(src, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'] })
}

export function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!iso) return '—'
  // Date-only strings ("2026-10-06") parse as UTC midnight and would render a
  // day early west of Greenwich — parse them as local calendar dates instead.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // UTC-midnight timestamps are semantically dates (due dates) — format in UTC
  // so they don't slip a day in western timezones.
  if (/T00:00:00(\.\d+)?Z$/.test(iso)) return d.toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' })
  return d.toLocaleDateString(undefined, opts)
}

export function fmtTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function dayKey(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone }) // YYYY-MM-DD
}

export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function isOverdue(dueAt: string | null | undefined): boolean {
  return !!dueAt && new Date(dueAt).getTime() < Date.now()
}

/** Minutes since midnight of `iso`, as seen in `timeZone`. */
export function tzMinutesOfDay(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

/** UTC ISO string for wall-clock `minutes` on `day` (YYYY-MM-DD) in `timeZone`. */
export function zonedToUtc(day: string, minutes: number, timeZone: string): string {
  const [y, mo, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60)
  // what wall time does `guess` show in the zone? adjust by the difference
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(guess - (shown - guess)).toISOString()
}

/** List of YYYY-MM-DD between two dates inclusive. */
export function dayRange(startsOn: string, endsOn: string): string[] {
  const out: string[] = []
  const d = new Date(`${startsOn.slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${endsOn.slice(0, 10)}T00:00:00Z`)
  while (d <= end && out.length < 14) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** {{var}} substitution preview for email templates. */
export function renderVars(src: string, vars: Record<string, string>): string {
  return src.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`)
}
