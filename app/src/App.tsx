import { Route, Routes, Navigate } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { FormPage, FormSuccessPage } from './pages/cfp/FormPage'
import { PortalPage } from './pages/portal/PortalPage'
import { EmbedSpeakers } from './pages/embed/EmbedSpeakers'
import { EmbedSchedule } from './pages/embed/EmbedSchedule'
import { LoginPage } from './pages/org/LoginPage'
import { OrgLayout } from './pages/org/OrgLayout'
import { DashboardPage } from './pages/org/DashboardPage'
import { SubmissionsPage } from './pages/org/SubmissionsPage'
import { ReviewPage } from './pages/org/ReviewPage'
import { LeaderboardPage } from './pages/org/LeaderboardPage'
import { SchedulePage } from './pages/org/SchedulePage'
import { CommsPage } from './pages/org/CommsPage'
import { ResourcesPage } from './pages/org/ResourcesPage'
import { FormsPage } from './pages/org/FormsPage'
import { SettingsPage } from './pages/org/SettingsPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      {/* public CFP */}
      <Route path="/f/:formId" element={<FormPage />} />
      <Route path="/f/:formId/success" element={<FormSuccessPage />} />

      {/* speaker portal (magic token) */}
      <Route path="/portal" element={<PortalPage />} />

      {/* public embeds */}
      <Route path="/embed/speakers/:slug" element={<EmbedSpeakers />} />
      <Route path="/embed/schedule/:slug" element={<EmbedSchedule />} />

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
  )
}
