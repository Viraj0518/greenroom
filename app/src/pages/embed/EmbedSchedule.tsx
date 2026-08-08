import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import type { PublicScheduleItem, PublicScheduleResponse } from '../../types'
import { dayKey, fmtDate, fmtTime } from '../../lib'
import { Avatar, Spinner } from '../../components/ui'
import '../../styles/embed.css'

export function EmbedSchedule() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<PublicScheduleResponse | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    api.publicSchedule(slug).then(setData).catch(() => setErr(true))
  }, [slug])

  const days = useMemo(() => {
    if (!data) return []
    const by = new Map<string, PublicScheduleItem[]>()
    for (const it of data.items) {
      const k = dayKey(it.starts_at, data.event.timezone)
      by.set(k, [...(by.get(k) ?? []), it])
    }
    return [...by.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, items]) => ({
        day: k,
        items: items.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || (a.room ?? '').localeCompare(b.room ?? '')),
      }))
  }, [data])

  return (
    <div className="embed">
      <div className="embed-inner">
        {err ? <p className="muted" style={{ textAlign: 'center' }}>The schedule is not available right now.</p>
          : !data ? <Spinner label="Loading schedule…" />
            : (
              <>
                <header className="embed-head">
                  <h1>Schedule</h1>
                  <p className="sub">{data.event.name} · all times {data.event.timezone.replace(/_/g, ' ')}</p>
                </header>
                {days.length === 0 && <p className="muted" style={{ textAlign: 'center' }}>Schedule coming soon.</p>}
                {days.map(({ day, items }) => (
                  <section key={day} className="emb-day">
                    <h2>{fmtDate(`${day}T12:00:00Z`, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
                    {items.map((it) => (
                      <article key={it.id} className={`emb-slot${it.kind !== 'talk' ? ' break' : ''}`}
                        style={{ ['--track' as string]: it.track_color ?? undefined }}>
                        <div className="when">
                          {fmtTime(it.starts_at, data.event.timezone)}<br />
                          <span className="faint">–{fmtTime(it.ends_at, data.event.timezone)}</span>
                          {it.room && <span className="room">{it.room}</span>}
                        </div>
                        <div>
                          <h3>
                            {it.title}
                            {it.track && it.kind === 'talk' && (
                              <span className="emb-track-pill" style={{ background: it.track_color ?? 'var(--faint)' }}>
                                {it.track}
                              </span>
                            )}
                          </h3>
                          {it.speaker && (
                            <div className="spk">
                              <Avatar name={it.speaker.name} src={it.speaker.headshot_url} size={22} />
                              <span>
                                <strong>{it.speaker.name}</strong>
                                {it.speaker.tagline && <span className="faint"> — {it.speaker.tagline}</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </section>
                ))}
              </>
            )}
        <footer className="embed-footer">
          Powered by <a href="/" target="_blank" rel="noreferrer">GreenRoom</a>
        </footer>
      </div>
    </div>
  )
}
