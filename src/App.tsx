import { Link, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { AdminPage } from './pages/AdminPage'
import { ChallengeSelectPage } from './pages/ChallengeSelectPage'
import { LandingPage } from './pages/LandingPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { PublicLaunchPage } from './pages/PublicLaunchPage'
import { PublicLeaderboardPage } from './pages/PublicLeaderboardPage'
import { RegisterPage } from './pages/RegisterPage'
import { WorkoutPage } from './pages/WorkoutPage'
import { InviteSetupPage } from './pages/InviteSetupPage'

function App() {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link to="/home" className="brand">
          FitPerks
        </Link>
        <nav>
          <Link to="/home">Home</Link>
          <Link to="/challenges">Choose Challenge</Link>
          <Link to="/leaderboard">Scoreboard</Link>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<LandingPage />} />
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
