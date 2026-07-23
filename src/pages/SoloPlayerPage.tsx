import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CHALLENGES } from '../lib/constants'
import { getSoloProgress } from '../lib/supabaseApi'
import { getLastGuestEmail, getLastGuestName, saveGuestJoinContext } from '../lib/storage'
import type { ExerciseType, SoloComparisonRow, SoloProgressBucket, SoloProgressSummary } from '../types'

const EMPTY_PROGRESS: SoloProgressSummary = {
  playerName: '',
  playerEmail: '',
  currentStreak: 0,
  longestStreak: 0,
  todayBestScore: 0,
  todayMaxReps: 0,
  totalAttempts: 0,
  daily: [],
  weekly: [],
  monthly: [],
  consistencyLeaders: [],
  maxRepLeaders: [],
}

const SOLO_EXERCISES: ExerciseType[] = ['squat', 'burpee', 'high-knees', 'lunges']

type ChartMode = 'daily' | 'weekly' | 'monthly'

function ProgressBars({ rows }: { rows: SoloProgressBucket[] }) {
  const maxScore = Math.max(1, ...rows.map((row) => row.score))

  return (
    <div className="solo-bars" aria-label="Solo progress chart">
      {rows.map((row) => (
        <div className="solo-bar-column" key={row.label}>
          <div className="solo-bar-track">
            <span style={{ height: `${Math.max(4, (row.score / maxScore) * 100)}%` }} />
          </div>
          <strong>{row.score}</strong>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  )
}

function SoloEmptyProgress() {
  return (
    <div className="solo-empty-state" aria-label="Solo starter state">
      <div className="solo-empty-orbit" aria-hidden="true">
        <span />
        <strong>0</strong>
      </div>
      <div className="solo-empty-copy">
        <p className="solo-empty-kicker">First session</p>
        <h3>Set today&apos;s benchmark.</h3>
        <p>Pick a workout, save your score, and this space turns into your daily progress board.</p>
      </div>
      <div className="solo-empty-milestones" aria-label="Solo milestones">
        <span>Daily best</span>
        <span>Streak day 1</span>
        <span>Leaderboard ready</span>
      </div>
    </div>
  )
}

function SoloLeaderboard({ title, rows, metric }: { title: string; rows: SoloComparisonRow[]; metric: 'consistency' | 'maxReps' }) {
  return (
    <article className="solo-board">
      <h3>{title}</h3>
      {rows.length ? (
        <div className="solo-rank-list">
          {rows.map((row) => (
            <div className="solo-rank-row" key={`${title}-${row.playerEmail}`}>
              <span>{row.rank}</span>
              <strong>{row.playerName || row.playerEmail}</strong>
              <em>{metric === 'consistency' ? `${row.consistencyDays} days` : `${row.maxReps} reps`}</em>
            </div>
          ))}
        </div>
      ) : (
        <div className="solo-board-empty">
          <span />
          <p>First score waiting.</p>
        </div>
      )}
    </article>
  )
}

export function SoloPlayerPage() {
  const [searchParams] = useSearchParams()
  const [playerName, setPlayerName] = useState(() => getLastGuestName())
  const [playerEmail, setPlayerEmail] = useState(() => searchParams.get('email') || getLastGuestEmail())
  const [progress, setProgress] = useState<SoloProgressSummary>(EMPTY_PROGRESS)
  const [chartMode, setChartMode] = useState<ChartMode>('daily')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const normalizedEmail = playerEmail.trim().toLowerCase()
  const selectedRows = useMemo(() => progress[chartMode], [chartMode, progress])
  const hasSoloHistory = progress.totalAttempts > 0

  useEffect(() => {
    if (!normalizedEmail) {
      setProgress(EMPTY_PROGRESS)
      return
    }

    setLoading(true)
    setError(null)
    void getSoloProgress(normalizedEmail)
      .then((payload) => {
        setProgress(payload)
        setPlayerName((current) => current.trim() || payload.playerName)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load solo progress.'))
      .finally(() => setLoading(false))
  }, [normalizedEmail])

  function rememberPlayer() {
    saveGuestJoinContext({ guestName: playerName.trim() || 'Solo Player', guestEmail: normalizedEmail, challengeCode: 'solo' })
  }

  const canStart = Boolean(normalizedEmail && normalizedEmail.includes('@'))

  return (
    <main className="page solo-page">
      <section className="panel solo-shell">
        <div className="solo-header">
          <div>
            <p className="hero-kicker">Play Solo</p>
            <h1>Your daily best counts.</h1>
            <p className="hint">Unlimited tries. FitPerks uses your best score of the day for progress and comparisons.</p>
          </div>
          <Link className="button ghost button-small" to="/home">Home</Link>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="solo-layout">
          <section className="solo-left stack">
            <div className="solo-profile-grid">
              <label>
                Email
                <input type="email" value={playerEmail} onChange={(event) => setPlayerEmail(event.target.value)} placeholder="name@example.com" required />
              </label>
              <label>
                Name
                <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Alex" maxLength={80} />
              </label>
            </div>

            <div className="solo-workouts">
              {SOLO_EXERCISES.map((exercise) => {
                const workout = CHALLENGES.find((item) => item.id === exercise)
                return workout ? (
                  <Link
                    className={`button primary solo-workout-button solo-workout-${exercise}`}
                    to={canStart ? `/solo/workout/${exercise}` : '#'}
                    onClick={(event) => {
                      if (!canStart) {
                        event.preventDefault()
                        setError('Enter a valid email before starting solo mode.')
                        return
                      }
                      rememberPlayer()
                    }}
                    key={exercise}
                  >
                    {workout.name.replace(' Challenge', '')}
                  </Link>
                ) : null
              })}
            </div>
          </section>

          <section className="solo-right">
            <div className="solo-stat-grid">
              <article><span>Today best</span><strong>{progress.todayBestScore}</strong></article>
              <article><span>Max reps</span><strong>{progress.todayMaxReps}</strong></article>
              <article><span>Streak</span><strong>{progress.currentStreak}</strong></article>
              <article><span>Attempts</span><strong>{progress.totalAttempts}</strong></article>
            </div>

            <div className="solo-chart-card">
              <div className="solo-chart-head">
                <h2>Progress</h2>
                <div className="challenge-entry-tabs solo-chart-tabs" role="tablist" aria-label="Solo progress range">
                  {(['daily', 'weekly', 'monthly'] as ChartMode[]).map((mode) => (
                    <button className={chartMode === mode ? 'active' : ''} type="button" onClick={() => setChartMode(mode)} key={mode}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              {loading ? <p className="hint">Loading progress...</p> : hasSoloHistory ? <ProgressBars rows={selectedRows} /> : <SoloEmptyProgress />}
            </div>

            <div className="solo-board-grid">
              <SoloLeaderboard title="Consistency" rows={progress.consistencyLeaders} metric="consistency" />
              <SoloLeaderboard title="Max Reps" rows={progress.maxRepLeaders} metric="maxReps" />
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
