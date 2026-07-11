import { Link } from 'react-router-dom'
import { CommuteWorkoutAnime } from '../components/CommuteWorkoutAnime'

export function LandingPage() {
  return (
    <main className="page landing-page">
      <section className="hero-panel hero-panel-dark">
        <div className="hero-copy">
          <p className="hero-kicker">FitPerks</p>
          <h1>Train Through the Commute.</h1>
          <p className="hero-subtitle">Everyone can now hit fitness goals on the way to school, college, and work.</p>
          <div className="hero-actions">
            <Link className="button primary" to="/challenges">
              Start
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
