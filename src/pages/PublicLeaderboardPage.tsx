import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { LeaderboardPage } from './LeaderboardPage'
import { getPublicLaunchContext } from '../lib/supabaseApi'

export function PublicLeaderboardPage() {
  const { country: countryParam, organization: orgParam } = useParams()
  const country = (countryParam ?? '').toLowerCase()
  const organization = (orgParam ?? '').toLowerCase()

  const [organizationCode, setOrganizationCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!country || !organization) {
      return
    }

    void getPublicLaunchContext({ countryCode: country, organizationSlug: organization })
      .then((context) => {
        setOrganizationCode(context.organizationCode)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to resolve leaderboard URL.')
      })
  }, [country, organization])

  if (!country || !organization) {
    return <Navigate to="/" replace />
  }

  if (error) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Leaderboard</h1>
          <p className="error">{error}</p>
        </section>
      </main>
    )
  }

  return <LeaderboardPage organizationCode={organizationCode} />
}
