// RFC 5545 VCALENDAR generation for speaker calendar invites.

export interface IcsEvent {
  uid: string
  title: string
  starts_at: string // ISO-8601 UTC
  ends_at: string
  location?: string
  description?: string
}

function icsDate(iso: string): string {
  // 2026-08-12T18:00:00.000Z -> 20260812T180000Z
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines at 75 octets per RFC 5545 (continuation lines start with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) parts.push(' ' + rest)
  return parts.join('\r\n')
}

export function buildCalendar(name: string, events: IcsEvent[], dtstamp: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GreenRoom//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
  ]
  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsEscape(ev.uid)}`,
      `DTSTAMP:${icsDate(dtstamp)}`,
      `DTSTART:${icsDate(ev.starts_at)}`,
      `DTEND:${icsDate(ev.ends_at)}`,
      `SUMMARY:${icsEscape(ev.title)}`
    )
    if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
