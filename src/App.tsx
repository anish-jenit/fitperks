import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { AdminPage } from './pages/AdminPage'
import { ChallengeSelectPage } from './pages/ChallengeSelectPage'
import { OrganizationRequestPage } from './pages/OrganizationRequestPage'
import { GuestChallengeLandingPage, GuestChallengePage, GuestScoreboardPage, JoinChallengePage } from './pages/GuestChallengePage'
import { LandingPage } from './pages/LandingPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { PublicLaunchPage } from './pages/PublicLaunchPage'
import { PublicLeaderboardPage } from './pages/PublicLeaderboardPage'
import { RegisterPage } from './pages/RegisterPage'
import { WorkoutPage } from './pages/WorkoutPage'
import { InviteSetupPage } from './pages/InviteSetupPage'

function App() {
  const location = useLocation()
  const isPublicHome = location.pathname === '/' || location.pathname === '/home'

  return (
    <div className="app-shell">
      <header className={`top-nav ${isPublicHome ? 'top-nav-minimal' : ''}`}>
        <Link to="/home" className="brand">
          FitPerks
        </Link>
        {isPublicHome ? null : (
          <nav>
            <Link to="/home">Home</Link>
            <Link to="/challenges">Choose Challenge</Link>
            <Link to="/leaderboard">Scoreboard</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        )}
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<LandingPage />} />
        <Route path="/join-challenge" element={<JoinChallengePage />} />
        <Route path="/guest-challenge" element={<GuestChallengePage />} />
        <Route path="/guest/:challengeCode" element={<GuestChallengeLandingPage />} />
        <Route path="/guest/:challengeCode/workout/:exercise" element={<WorkoutPage />} />
        <Route path="/guest/:challengeCode/scoreboard" element={<GuestScoreboardPage />} />
        <Route path="/organization-request" element={<OrganizationRequestPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/challenges" element={<ChallengeSelectPage />} />
        <Route path="/workout/:exercise" element={<WorkoutPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/setup/:token" element={<InviteSetupPage />} />
        <Route path="/launch/:country/:organization" element={<PublicLaunchPage />} />
        <Route path="/launch/:country/:organization/leaderboard" element={<PublicLeaderboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
