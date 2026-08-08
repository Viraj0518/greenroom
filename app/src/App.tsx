import { Component, Suspense, lazy, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import { Route, Routes, Navigate, Link } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Spinner } from './components/ui'
import { onMocksActivated, usingMocks } from './api'

/**
 * Shell-level error boundary: a crash in any page renders a readable error
 * card instead of a black screen (added after a judge-blocking dashboard
 * crash on staging, 2026-08-08).
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[greenroom] page crashed:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '14vh 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 10 }} aria-hidden>🫠</div>
        <h1>Something broke on this page</h1>
        <p className="muted" style={{ margin: '10px 0 18px' }}>
          The rest of the app is fine — this screen hit an unexpected error.
        </p>
        <p className="mono small" style={{
          background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
          marginBottom: 18, overflowWrap: 'break-word',
        }}>
          {String(this.state.error)}
        </p>
        <span className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); window.location.reload() }}>
            Reload
          </button>
          <Link className="btn" to="/" onClick={() => this.setState({ error: null })}>Go home</Link>
        </span>
      </main>
    )
  }
}

/** Persistent, non-dismissable indicator that the UI is running on demo data. */
function DemoChip() {
  const active = useSyncExternalStore(onMocksActivated, usingMocks)
  if (!active) return null
  return (
    <div role="status" style={{
      position: 'fixed', bottom: 14, left: 14, zIndex: 300, pointerEvents: 'none',
      background: 'var(--warn-soft)', color: 'var(--warn)', border: '1px solid var(--warn)',
      borderRadius: 999, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 650,
      boxShadow: 'var(--shadow-2)',
    }}>
      ◌ demo data — no live backend
    </div>
  )
}

// Code-split per surface (pinned decision #6): the public CFP form, the speaker
// portal, and the organizer app each load their own chunk. /embed/* is
// server-rendered by the backend (see embed-templates.ts) — no SPA route.
const load = <K extends string>(k: K) => <T extends Record<K, ComponentType>>(m: T) => ({ default: m[k] })

const FormPage = lazy(() => import('./pages/cfp/FormPage').then(load('FormPage')))
const FormSuccessPage = lazy(() => import('./pages/cfp/FormPage').then(load('FormSuccessPage')))
const PortalPage = lazy(() => import('./pages/portal/PortalPage').then(load('PortalPage')))
const LoginPage = lazy(() => import('./pages/org/LoginPage').then(load('LoginPage')))
const OrgLayout = lazy(() => import('./pages/org/OrgLayout').then(load('OrgLayout')))
const DashboardPage = lazy(() => import('./pages/org/DashboardPage').then(load('DashboardPage')))
const SubmissionsPage = lazy(() => import('./pages/org/SubmissionsPage').then(load('SubmissionsPage')))
const ReviewPage = lazy(() => import('./pages/org/ReviewPage').then(load('ReviewPage')))
const LeaderboardPage = lazy(() => import('./pages/org/LeaderboardPage').then(load('LeaderboardPage')))
const SchedulePage = lazy(() => import('./pages/org/SchedulePage').then(load('SchedulePage')))
const CommsPage = lazy(() => import('./pages/org/CommsPage').then(load('CommsPage')))
const ResourcesPage = lazy(() => import('./pages/org/ResourcesPage').then(load('ResourcesPage')))
const FormsPage = lazy(() => import('./pages/org/FormsPage').then(load('FormsPage')))
const SettingsPage = lazy(() => import('./pages/org/SettingsPage').then(load('SettingsPage')))

export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <DemoChip />
        <Routes>
        <Route path="/" element={<Landing />} />

        {/* public CFP */}
        <Route path="/f/:formId" element={<FormPage />} />
        <Route path="/f/:formId/success" element={<FormSuccessPage />} />

        {/* speaker portal (magic token) */}
        <Route path="/portal" element={<PortalPage />} />

        {/* organizer app */}
        <Route path="/org/login" element={<LoginPage />} />
        <Route path="/org" element={<OrgLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="submissions" element={<SubmissionsPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="comms" element={<CommsPage />} />
          <Route path="resources" element={<ResourcesPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
