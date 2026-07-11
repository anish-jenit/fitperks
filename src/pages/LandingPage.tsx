import { Link } from 'react-router-dom'
import { CommuteWorkoutAnime } from '../components/CommuteWorkoutAnime'

export function LandingPage() {
  return (
    <main className="page landing-page">
      <section className="hero-panel hero-panel-dark">
        <div className="hero-copy">
          <p className="hero-kicker">FitPerks</p>
          <h1>Invite-Driven Challenge Flow.</h1>
          <p className="hero-subtitle">
            Platform admin sends setup invite. POC configures dates and gets a launch URL for iPad challenge and laptop scoreboard.
          </p>
          <div className="hero-actions">
            <Link className="button primary" to="/admin">
              Admin Login
            </Link>
            <Link className="button ghost" to="/leaderboard">
              View Leaderboards
            </Link>
          </div>
        </div>

        <CommuteWorkoutAnime />
      </section>
    </main>
  )
}
