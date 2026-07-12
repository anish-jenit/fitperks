import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { CommuteWorkoutAnime } from '../components/CommuteWorkoutAnime'
import { getPublicLaunchContext } from '../lib/supabaseApi'
import { setConfiguredOrganizationCode } from '../lib/storage'
import type { PublicLaunchContext } from '../types'

export function PublicLaunchPage() {
  const { country: countryParam, organization: orgParam } = useParams()

  const country = (countryParam ?? '').toLowerCase()
  const organization = (orgParam ?? '').toLowerCase()
  const [context, setContext] = useState<PublicLaunchContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!country || !organization) {
      setLoading(false)
      setError('Invalid launch URL.')
      return
    }

    void getPublicLaunchContext({ countryCode: country, organizationSlug: organization })
      .then((payload) => {
        setContext(payload)
        if (payload.setupStatus === 'ready') {
          setConfiguredOrganizationCode(payload.organizationCode)
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load organization launch page.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [country, organization])

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
        <p className="hero-kicker">{context?.setupStatus === 'ready' ? 'Organization Challenge' : 'Almost Ready'}</p>
        <h1>{context ? context.organizationName : 'Organization Challenge'}</h1>
        <p className="hero-subtitle">
          {context?.setupStatus === 'ready'
            ? context.displayMessage || 'Choose a workout, track your reps, and follow the live leaderboard.'
            : 'Setup is still warming up. Once the organization setup is complete, this challenge link will take everyone straight to the workout choices.'}
        </p>

        {error ? <p className="error">{error}</p> : null}

        <div className="hero-actions">
          {context?.setupStatus === 'pending' && context.setupUrlPath ? (
            <Link className="button primary" to={context.setupUrlPath}>
              Finish Setup
            </Link>
          ) : null}
          {context?.setupStatus === 'ready' ? (
            <>
              <Link className="button primary" to="/challenges">
                Enter Challenge
              </Link>
              <Link className="button ghost" to={`/launch/${country}/${organization}/leaderboard`}>
                View Leaderboard
              </Link>
            </>
          ) : null}
          <Link className="button ghost button-small" to="/">
            Back Home
          </Link>
        </div>

        <CommuteWorkoutAnime />
      </section>
    </main>
  )
}
