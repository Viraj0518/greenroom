import { Link } from 'react-router-dom'
import '../styles/landing.css'

// Demo organizer credentials + CFP form id shown to judges — MUST match db/
// seed (QA verifies these against the live deployment; drift here is a
// judge-facing dead-end). Coordinate changes with the data lane.
const DEMO_EMAIL = 'admin@example.com'
const DEMO_PASSWORD = 'demo-greenroom-2026'
const CFP_FORM_ID = 'form_cfp' // renamed in a4's reseed 2026-08-08 — friendly TEXT PK

// /embed/* and /f/* open real product surfaces; embeds are server-rendered (pin #6)
const FEATURES = [
  { href: `/f/${CFP_FORM_ID}`, glyph: '📝', title: 'CFP forms', go: 'Try the live form →',
    desc: 'Custom submission forms with conditional questions and automatic category → track routing.' },
  { href: '/org/review', glyph: '✨', title: 'Reviews + AI assist', go: 'Open review queue →',
    desc: 'Rubric scoring across rounds, a reviewer queue, leaderboards — and one-click AI reviews.' },
  { href: '/org/schedule', glyph: '🧲', title: 'Drag-and-drop scheduler', go: 'Open scheduler →',
    desc: 'Rooms × time grid with live conflict detection — double-booked rooms and speakers flash red.' },
  { href: '/portal', glyph: '🎤', title: 'Speaker portal', go: 'Open portal →',
    desc: 'Magic-link self-service: bios, headshots, slides, and an onboarding checklist with due dates.' },
  { href: '/org/comms', glyph: '✉️', title: 'Comms + calendar invites', go: 'Open comms →',
    desc: 'Markdown templates with variables, batch sends by status, full email log, ICS invites.' },
  { href: '/embed/schedule/devconf-2026', glyph: '📱', title: 'Public embeds', go: 'View schedule embed →', external: true,
    desc: 'Zero-JS, server-rendered speaker gallery and agenda pages, built to be iframed anywhere.' },
]

export function Landing() {
  return (
    <main className="land">
      <section className="land-hero">
        <div className="land-mark" aria-hidden>🟢</div>
        <h1>Run your conference’s entire speaker pipeline.</h1>
        <p className="land-tag">
          GreenRoom is open-source speaker &amp; content management — CFPs, reviews, scheduling,
          onboarding, comms, and embeds. One Cloudflare deploy.
        </p>
        <div className="land-ctas">
          <Link to="/org" className="btn btn-primary">Open the organizer demo</Link>
          <Link to={`/f/${CFP_FORM_ID}`} className="btn">Submit a talk</Link>
        </div>
      </section>

      <section className="judge-card" aria-label="Quick tour">
        <header>⏱ 60-second tour</header>
        <div className="judge-steps">
          <div className="judge-step">
            <span className="judge-num">1</span>
            <span>
              <Link to="/org">Sign in as an organizer</Link> with{' '}
              <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code> — dashboard, triage, reviews.
            </span>
          </div>
          <div className="judge-step">
            <span className="judge-num">2</span>
            <span>
              Open the <Link to="/org/schedule">scheduler</Link> and drag a talk from the tray —
              watch conflicts light up red.
            </span>
          </div>
          <div className="judge-step">
            <span className="judge-num">3</span>
            <span>
              See the public side: the <Link to={`/f/${CFP_FORM_ID}`}>CFP form</Link> and the{' '}
              <a href="/embed/speakers/devconf-2026">speaker</a> &amp;{' '}
              <a href="/embed/schedule/devconf-2026">schedule</a> embeds.
            </span>
          </div>
        </div>
      </section>

      <section className="feat-grid" aria-label="Features">
        {FEATURES.map((f) => (
          f.external
            ? (
              <a key={f.title} className="feat" href={f.href}>
                <div className="glyph" aria-hidden>{f.glyph}</div>
                <strong>{f.title}</strong>
                <p>{f.desc}</p>
                <span className="go">{f.go}</span>
              </a>
            )
            : (
              <Link key={f.title} className="feat" to={f.href}>
                <div className="glyph" aria-hidden>{f.glyph}</div>
                <strong>{f.title}</strong>
                <p>{f.desc}</p>
                <span className="go">{f.go}</span>
              </Link>
            )
        ))}
      </section>

      <footer className="land-foot">
        Open source (MIT) · React + Hono + Cloudflare Pages · D1 + R2 ·
        Accelevents &amp; Airtable sync · built for the “Kill My SaaS” challenge
      </footer>
    </main>
  )
}
