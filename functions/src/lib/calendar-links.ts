// Add-to-calendar deeplinks (Google Calendar + Outlook) for a single event —
// covers requirement 3's "Gmail, Outlook" alongside the ICS (iCal) attachment.

export interface CalendarLinkEvent {
  title: string
  starts_at: string // ISO-8601 UTC
  ends_at: string
  location?: string
  description?: string
}

function compact(iso: string): string {
  // 2026-10-06T16:00:00Z -> 20261006T160000Z
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function googleCalendarLink(ev: CalendarLinkEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${compact(ev.starts_at)}/${compact(ev.ends_at)}`,
  })
  if (ev.description) params.set('details', ev.description)
  if (ev.location) params.set('location', ev.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function outlookCalendarLink(ev: CalendarLinkEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
    startdt: new Date(ev.starts_at).toISOString(),
    enddt: new Date(ev.ends_at).toISOString(),
  })
  if (ev.description) params.set('body', ev.description)
  if (ev.location) params.set('location', ev.location)
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}
