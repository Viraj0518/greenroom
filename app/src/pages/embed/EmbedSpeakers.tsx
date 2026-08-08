import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import type { PublicSpeakersResponse } from '../../types'
import { Avatar, Spinner } from '../../components/ui'
import '../../styles/embed.css'

export function EmbedSpeakers() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<PublicSpeakersResponse | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    api.publicSpeakers(slug).then(setData).catch(() => setErr(true))
  }, [slug])

  return (
    <div className="embed">
      <div className="embed-inner">
        {err ? <p className="muted" style={{ textAlign: 'center' }}>Speakers are not available right now.</p>
          : !data ? <Spinner label="Loading speakers…" />
            : (
              <>
                <header className="embed-head">
                  <h1>Speakers</h1>
                  <p className="sub">{data.event.name} · {data.speakers.length} confirmed</p>
                </header>
                <div className="spk-grid">
                  {data.speakers.map((s) => (
                    <article key={s.id} className="spk-card">
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <Avatar name={s.name} src={s.headshot_url} size={72} />
                      </div>
                      <h2>{s.name}</h2>
                      {s.tagline && <p className="tagline">{s.tagline}</p>}
                      {s.company && <p className="company">{s.company}</p>}
                      {s.bio && (
                        <details>
                          <summary>About</summary>
                          <p className="bio">{s.bio}</p>
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
        <footer className="embed-footer">
          Powered by <a href="/" target="_blank" rel="noreferrer">GreenRoom</a>
        </footer>
      </div>
    </div>
  )
}
