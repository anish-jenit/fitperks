import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <main className="page public-home">
      <section className="minimal-hero">
        <div className="minimal-mark" aria-hidden="true">
          <span />
        </div>
        <p className="hero-kicker">FitPerks</p>
        <h1 className="home-tagline">Every Move Deserves a Perk.</h1>
        <p className="minimal-copy">Choose your FitPerks path and start moving in a few calm clicks.</p>
        <div className="hero-actions minimal-actions">
          <Link className="button ghost" to="/solo">
            Play Solo
          </Link>
          <Link className="button ghost" to="/guest-challenge">
            Create / Join Challenge
          </Link>
          <Link className="button ghost" to="/demo">
            Org Demo
          </Link>
        </div>
      </section>
    </main>
  )
}
