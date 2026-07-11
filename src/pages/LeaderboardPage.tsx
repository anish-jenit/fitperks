import { useLeaderboardData } from '../hooks/useLeaderboardData'

function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>
}

type LeaderboardPageProps = {
  organizationCode?: string | null
}

export function LeaderboardPage({ organizationCode = null }: LeaderboardPageProps) {
  const { loading, error, challenge, todayIndividual, overallIndividual } = useLeaderboardData(organizationCode)

  return (
    <main className="page">
      <section className="panel">
        <h1>Leaderboards</h1>
        <p>
          Live updates are enabled for participant and team rankings.
          {challenge ? ` Active challenge: ${challenge.name}` : ' No active challenge selected.'}
        </p>

        {loading ? <p>Loading leaderboard data...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="leaderboard-grid">
          <article>
            <h2>Daily</h2>
            {todayIndividual.length === 0 ? (
              <EmptyState text="No scores yet today." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Team</th>
                    <th>Total Squats</th>
                    <th>Total Jumping Jacks</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {todayIndividual.map((row) => (
                    <tr key={row.participantId}>
                      <td>{row.participantName}</td>
                      <td>{row.teamName}</td>
                      <td>{row.totalSquats}</td>
                      <td>{row.totalBurpees}</td>
                      <td>{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          <article>
            <h2>Overall</h2>
            {overallIndividual.length === 0 ? (
              <EmptyState text="No lifetime scores yet." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Team</th>
                    <th>Total Squats</th>
                    <th>Total Jumping Jacks</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {overallIndividual.map((row) => (
                    <tr key={row.participantId}>
                      <td>{row.participantName}</td>
                      <td>{row.teamName}</td>
                      <td>{row.totalSquats}</td>
                      <td>{row.totalBurpees}</td>
                      <td>{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </div>
      </section>
    </main>
  )
}
