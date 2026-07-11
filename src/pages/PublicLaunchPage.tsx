import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CommuteWorkoutAnime } from '../components/CommuteWorkoutAnime'
import { getPublicLaunchContext } from '../lib/supabaseApi'
import { setConfiguredOrganizationCode } from '../lib/storage'
import type { PublicLaunchContext } from '../types'

export function PublicLaunchPage() {
  const navigate = useNavigate()
  const { country: countryParam, organization: orgParam } = useParams()

  const country = (countryParam ?? '').toLowerCase()
  const organization = (orgParam ?? '').toLowerCase()
  const [context, setContext] = useState<PublicLaunchContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const leaderboardPath = useMemo(() => `/launch/${country}/${organization}/leaderboard`, [country, organization])

  useEffect(() => {
    if (!country || !organization) {
      setLoading(false)
      setError('Invalid launch URL.')
      return
    }

    void getPublicLaunchContext({ countryCode: country, organizationSlug: organization })
      .then((payload) => {
        setContext(payload)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load organization launch page.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [country, organization])

  function startChallenge() {
    if (!context) {
      return
    }

    setConfiguredOrganizationCode(context.organizationCode)
    navigate('/challenges')
  }

  if (!country || !organization) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <main className="page landing-page">
        <section className="hero-panel">
          <p>Loading launch page...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page landing-page">
      <section className="hero-panel hero-panel-dark">
        <p className="hero-kicker">FitPerks Challenge</p>
        <h1>{context ? context.organizationName : 'Organization Challenge'}</h1>
        <p className="hero-subtitle">
          {context?.displayMessage || 'Everyone can now hit fitness goals on the way to school, college, and work.'}
        </p>

        {error ? <p className="error">{error}</p> : null}

        <div className="hero-actions">
          <button className="button primary" onClick={startChallenge} disabled={!context}>
            Start
          </button>
          <Link className="button ghost button-small" to={leaderboardPath}>
            View Leaderboard
          </Link>
        </div>

        <CommuteWorkoutAnime />
      </section>
    </main>
  )
}
