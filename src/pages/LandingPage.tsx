import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <main className="page public-home">
      <section className="minimal-hero">
        <div className="minimal-mark" aria-hidden="true">
          <span />
        </div>
        <p className="hero-kicker">FitPerks</p>
        <h1>Fitness challenges, beautifully simple.</h1>
        <p className="home-tagline">Every Move Deserves a Perk.</p>
        <p className="minimal-copy">Create a quick guest challenge, or request a managed organization rollout.</p>
        <div className="hero-actions minimal-actions">
          <Link className="button primary" to="/guest-challenge">
            Create Challenge (Limited Edition)
          </Link>
          <Link className="button ghost" to="/organization-request">
            Organization Challenge Request
          </Link>
        </div>
      </section>
    </main>
  )
}
