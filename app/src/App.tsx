import { Suspense, lazy, type ComponentType } from 'react'
import { Route, Routes, Navigate } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Spinner } from './components/ui'

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
    <Suspense fallback={<Spinner label="Loading…" />}>
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
