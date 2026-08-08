import { Link } from 'react-router-dom'

// /embed/* tiles use <a> — those pages are server-rendered by the API, not SPA routes
const tiles = [
  { to: '/f/form_cfp', title: 'Submit a talk', desc: 'Public CFP form with conditional questions and category routing.', glyph: '📝' },
  { to: '/portal', title: 'Speaker portal', desc: 'Self-service profile, uploads, and onboarding checklist.', glyph: '🎤' },
  { to: '/org', title: 'Organizer app', desc: 'Triage, reviews, drag-and-drop scheduling, comms, dashboards.', glyph: '🗂️' },
  { to: '/embed/speakers/devconf-2026', title: 'Speaker embed', desc: 'Drop-in speaker gallery for your event site.', glyph: '👥', external: true },
  { to: '/embed/schedule/devconf-2026', title: 'Schedule embed', desc: 'Mobile-friendly agenda embed, grouped by day and room.', glyph: '📅', external: true },
]

export function Landing() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '9vh 20px 60px' }}>
      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: '2.6rem', marginBottom: 8 }} aria-hidden>🟢</div>
        <h1 style={{ fontSize: '2rem' }}>GreenRoom</h1>
        <p className="muted" style={{ marginTop: 8, fontSize: '1.05rem' }}>
          Open-source speaker &amp; content management for conferences.<br />
          CFPs → reviews → scheduling → speaker onboarding → embeds. One deploy.
        </p>
      </header>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {tiles.map((t) => {
          const inner = (
            <>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }} aria-hidden>{t.glyph}</div>
              <strong>{t.title}</strong>
              <p className="muted small" style={{ marginTop: 4 }}>{t.desc}</p>
            </>
          )
          const style = { textDecoration: 'none', color: 'inherit' } as const
          return t.external
            ? <a key={t.to} href={t.to} className="card card-pad" style={style}>{inner}</a>
            : <Link key={t.to} to={t.to} className="card card-pad" style={style}>{inner}</Link>
        })}
      </div>

      <footer className="faint small" style={{ textAlign: 'center', marginTop: 44 }}>
        MIT licensed · Cloudflare Pages + D1 + R2 ·{' '}
        <a href="https://github.com" onClick={(e) => e.preventDefault()}>source</a>
      </footer>
    </main>
  )
}
