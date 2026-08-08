import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { api, usingMocks } from '../../api'
import type { EventRec, User } from '../../types'
import { Badge, Button, Spinner } from '../../components/ui'
import '../../styles/org.css'

interface OrgCtxValue { user: User; event: EventRec }
const OrgCtx = createContext<OrgCtxValue | null>(null)

/** Current organizer + event; only rendered inside OrgLayout after auth. */
export function useOrg(): OrgCtxValue {
  const v = useContext(OrgCtx)
  if (!v) throw new Error('useOrg outside OrgLayout')
  return v
}

const NAV = [
  { to: '/org', label: 'Dashboard', glyph: '▦', end: true },
  { to: '/org/submissions', label: 'Submissions', glyph: '☰' },
  { to: '/org/review', label: 'Review', glyph: '✓' },
  { to: '/org/leaderboard', label: 'Leaderboard', glyph: '↑' },
  { to: '/org/schedule', label: 'Schedule', glyph: '▤' },
  { to: '/org/comms', label: 'Comms', glyph: '✉' },
  { to: '/org/resources', label: 'Resources', glyph: '📄' },
  { to: '/org/forms', label: 'Forms', glyph: '⊞' },
  { to: '/org/settings', label: 'Settings', glyph: '⚙' },
]

function toggleTheme() {
  const cur = document.documentElement.dataset.theme
    ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const next = cur === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  localStorage.setItem('gr-theme', next)
}

export function OrgLayout() {
  const nav = useNavigate()
  const [state, setState] = useState<OrgCtxValue | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { user } = await api.me()
        const events = await api.listEvents()
        if (!alive) return
        if (events.length === 0) { setErr('No events yet — create one via the API/seed.'); return }
        setState({ user, event: events[0] })
      } catch {
        nav('/org/login', { replace: true })
      }
    })()
    return () => { alive = false }
  }, [nav])

  if (err) return <main className="org-main"><p className="muted">{err}</p></main>
  if (!state) return <Spinner label="Loading workspace…" />

  return (
    <OrgCtx.Provider value={state}>
      <div className="org">
        <aside className="org-side">
          <Link to="/" className="org-brand"><span aria-hidden>🟢</span> GreenRoom</Link>
          <nav className="org-nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end as boolean | undefined}
                className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <span aria-hidden style={{ width: 16, textAlign: 'center' }}>{n.glyph}</span>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="org-side-meta">
            {usingMocks() && <Badge tone="badge-warn">demo data</Badge>}
            <span className="small muted truncate" title={state.user.email}>{state.user.name}</span>
            <div className="row">
              <Button size="sm" variant="ghost" onClick={toggleTheme} title="Toggle theme">◐</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await api.logout(); nav('/org/login') }}>
                Sign out
              </Button>
            </div>
          </div>
        </aside>
        <main className="org-main">
          <Outlet />
        </main>
      </div>
    </OrgCtx.Provider>
  )
}
