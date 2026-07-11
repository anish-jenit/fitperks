import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CHALLENGES } from '../lib/constants'
import { createGuestChallenge, getGuestChallenge, getGuestChallengeForCreator, getGuestChallengesForEmail, getGuestScoreboard } from '../lib/supabaseApi'
import { getLastGuestChallengeCode, getLastGuestName, getOrCreateGuestCreatorKey, saveGuestJoinContext } from '../lib/storage'
import type { ExerciseType, GuestChallengeRecord, GuestChallengeSummary, GuestScoreboardRow } from '../types'

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path
  }

  return new URL(path, window.location.origin).toString()
}

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value)
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', 'true')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
  return Promise.resolve()
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    await copyText(value)
    setCopied(true)
    window.setTimeout(() => {
      setCopied(false)
    }, 1400)
  }

  return (
    <article className="copy-card">
      <span>{label}</span>
      <code>{value}</code>
      <button className="button ghost button-small" type="button" onClick={() => void onCopy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </article>
  )
}

function ShareLinks({ challenge }: { challenge: GuestChallengeRecord }) {
  const challengeUrl = buildUrl(`/guest/${challenge.code}`)
  const scoreboardUrl = buildUrl(`/guest/${challenge.code}/scoreboard`)
  const whatsappText = encodeURIComponent(`Join my FitPerks challenge: ${challengeUrl}`)

  return (
    <div className="url-list">
      <CopyableField label="Guest name" value={challenge.creatorName} />
      <CopyableField label="Challenge code" value={challenge.code} />
      <CopyableField label="Challenge URL" value={challengeUrl} />
      <CopyableField label="Scoreboard URL" value={scoreboardUrl} />
      <article>
        <span>WhatsApp share</span>
        <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer">
          Open WhatsApp
        </a>
      </article>
    </div>
  )
}

export function JoinChallengePage() {
  const navigate = useNavigate()
  const [guestName, setGuestName] = useState(() => getLastGuestName())
  const [guestEmail, setGuestEmail] = useState('')
  const [challengeCode, setChallengeCode] = useState(() => getLastGuestChallengeCode())
  const [challenges, setChallenges] = useState<GuestChallengeSummary[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!guestEmail.trim() || !guestName.trim()) {
      setError('Email and guest name are required.')
      return
    }

    try {
      setBusy(true)
      setError(null)
      const rows = await getGuestChallengesForEmail(guestEmail)
      setChallenges(rows)
      setSearched(true)
      if (!rows.length && !challengeCode.trim()) {
        setError('No current challenges found. Enter a challenge code to join a new one.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to find current challenges.')
    } finally {
      setBusy(false)
    }
  }

  function joinChallenge(code: string) {
    const normalizedCode = code.trim().toLowerCase()
    if (!normalizedCode) {
      setError('Choose a challenge or enter a challenge code.')
      return
    }

    saveGuestJoinContext({ guestName, guestEmail, challengeCode: normalizedCode })
    navigate(`/guest/${normalizedCode}`)
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        {error ? <p className="error">{error}</p> : null}

        <form className="stack" onSubmit={(event) => void onSubmit(event)}>
          <label>
            Email address
            <input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} required />
          </label>
          <label>
            Guest name
            <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={80} required />
          </label>
          <label>
            Challenge code <span className="hint">(optional)</span>
            <input
              value={challengeCode}
              onChange={(event) => setChallengeCode(event.target.value)}
              placeholder="weekend-move-abc123"
              maxLength={96}
            />
          </label>
          <button className="button primary" type="submit">
            {busy ? 'Finding challenges...' : 'Find Challenges'}
          </button>
        </form>

        {searched ? (
          <div className="join-results">
            {challenges.length ? challenges.map((challenge) => (
              <button className="join-result" type="button" key={challenge.code} onClick={() => joinChallenge(challenge.code)}>
                <div>
                  <strong>{challenge.title}</strong>
                  <p>{challenge.creatorName} · {challenge.durationDays} days · {challenge.playerCount}/{challenge.maxPlayers} players</p>
                  <p>{challenge.attemptsPerDay} attempts/day · {challenge.selectedExercises.length} workouts</p>
                </div>
                <span className="join-result-arrow" aria-hidden="true">→</span>
              </button>
            )) : <p className="hint">No current challenges match this email yet.</p>}
            {challengeCode.trim() ? (
              <button className="button primary" type="button" onClick={() => joinChallenge(challengeCode)}>
                Join with code
              </button>
            ) : null}
            {!challenges.length ? <Link className="button ghost" to="/guest-challenge">Create a new challenge</Link> : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export function GuestChallengePage() {
  const [title, setTitle] = useState('Weekend Move Challenge')
  const [creatorName, setCreatorName] = useState('')
  const [creatorEmail, setCreatorEmail] = useState('')
  const [durationDays, setDurationDays] = useState(3)
  const [attemptsPerDay, setAttemptsPerDay] = useState(3)
  const [startDate, setStartDate] = useState(() => dateInputValue(new Date()))
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(60)
  const [selectedExercises, setSelectedExercises] = useState<ExerciseType[]>(['squat', 'burpee'])
  const [created, setCreated] = useState<GuestChallengeRecord | null>(null)
  const [existingChallenge, setExistingChallenge] = useState<GuestChallengeRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedExercises.length) {
      setError('Choose at least one workout.')
      return
    }

    try {
      setBusy(true)
      setError(null)

      const challenge = await createGuestChallenge({
        creatorKey: getOrCreateGuestCreatorKey(),
        creatorName,
        creatorEmail,
        title,
        durationDays,
        attemptsPerDay,
        startDate: new Date(`${startDate}T12:00:00`).toISOString(),
        selectedExercises,
        sessionDurationSeconds,
      })
      setCreated(challenge)
      saveGuestJoinContext({
        guestName: creatorName,
        guestEmail: creatorEmail,
        challengeCode: challenge.code,
      })
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String(err.message)
          : 'Unable to create guest challenge.'
      if (message.includes('already have an active guest challenge')) {
        try {
          let active: GuestChallengeRecord
          try {
            active = await getGuestChallengeForCreator(getOrCreateGuestCreatorKey(), creatorEmail)
          } catch {
            const matches = await getGuestChallengesForEmail(creatorEmail)
            const match = matches.find((challenge) => challenge.creatorEmail === creatorEmail.trim().toLowerCase())
            if (!match) {
              throw new Error('Active guest challenge not found.')
            }
            active = match
          }
          setExistingChallenge(active)
          saveGuestJoinContext({
            guestName: active.creatorName,
            guestEmail: active.creatorEmail,
            challengeCode: active.code,
          })
          setError('You already have an active guest challenge. Share that one until it ends.')
        } catch {
          setError(message)
        }
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <p className="hero-kicker">Limited Edition</p>
        <h1>Create Challenge</h1>
        <p className="hint">For up to 10 players. Maximum duration is 7 days.</p>

        {error ? (
          <p className="error">
            {error}
            {existingChallenge ? (
              <button className="text-action" type="button" onClick={() => setCreated(existingChallenge)}>
                Share
              </button>
            ) : null}
          </p>
        ) : null}

        {created ? (
          <div className="setup-result">
            <h2>{created.title}</h2>
            <div className="stats-cards">
              <article>
                <p className="metric">{created.maxPlayers}</p>
                <p>Players</p>
              </article>
              <article>
                <p className="metric">{created.durationDays}</p>
                <p>Days</p>
              </article>
              <article>
                <p className="metric">{created.attemptsPerDay}</p>
                <p>Attempts/day</p>
              </article>
            </div>
            <p className="hint">Daily scoreboard uses the best 3 attempts when available. Session timer: {created.sessionDurationSeconds / 60} minutes.</p>
            <div className="hero-actions">
              {created.selectedExercises.map((exercise) => {
                const workout = CHALLENGES.find((item) => item.id === exercise)
                return workout ? (
                  <Link className="button ghost" to={`/guest/${created.code}/workout/${exercise}`} key={exercise}>
                    Start {workout.name.replace(' Challenge', '')}
                  </Link>
                ) : null
              })}
            </div>
            <ShareLinks challenge={created} />
          </div>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Challenge name
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required />
            </label>
            <label>
              Guest name
              <input value={creatorName} onChange={(event) => setCreatorName(event.target.value)} maxLength={80} required />
            </label>
            <label>
              Email address
              <input type="email" value={creatorEmail} onChange={(event) => setCreatorEmail(event.target.value)} required />
            </label>
            <div className="settings-grid">
              <label>
                Start date
                <input
                  type="date"
                  min={dateInputValue(new Date())}
                  max={dateInputValue(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000))}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label>
                Duration
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={durationDays}
                  onChange={(event) => setDurationDays(Number(event.target.value))}
                />
              </label>
              <label>
                Attempts per day
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={attemptsPerDay}
                  onChange={(event) => setAttemptsPerDay(Number(event.target.value))}
                />
              </label>
              <label>
                Session timer
                <select value={sessionDurationSeconds} onChange={(event) => setSessionDurationSeconds(Number(event.target.value))}>
                  <option value={60}>1 minute</option>
                  <option value={120}>2 minutes</option>
                  <option value={180}>3 minutes</option>
                </select>
              </label>
            </div>
            <fieldset className="workout-picker">
              <legend>Choose up to 3 workouts</legend>
              <div className="workout-choice-grid">
                {CHALLENGES.map((workout) => {
                  const selected = selectedExercises.includes(workout.id)
                  return (
                    <label className={`workout-choice ${selected ? 'selected' : ''}`} key={workout.id}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          setSelectedExercises((current) => selected
                            ? current.filter((id) => id !== workout.id)
                            : current.length < 3 ? [...current, workout.id] : current)
                        }}
                      />
                      <span className={`workout-glyph glyph-${workout.id}`} aria-hidden="true">{workout.id === 'squat' ? '↓' : workout.id === 'burpee' ? '✦' : workout.id === 'high-knees' ? '↑' : '↗'}</span>
                      <strong>{workout.name.replace(' Challenge', '')}</strong>
                    </label>
                  )
                })}
              </div>
            </fieldset>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create Challenge'}
            </button>
          </form>
        )}

        <Link className="inline-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  )
}

export function GuestChallengeLandingPage() {
  const { challengeCode = '' } = useParams()
  const [challenge, setChallenge] = useState<GuestChallengeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!challengeCode) {
      return
    }

    saveGuestJoinContext({
      guestName: getLastGuestName(),
      challengeCode,
    })

    void getGuestChallenge(challengeCode)
      .then(setChallenge)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Guest challenge not found.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [challengeCode])

  if (!challengeCode) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <main className="page">
        <section className="panel form-panel">
          <p>Loading guest challenge...</p>
        </section>
      </main>
    )
  }

  if (!challenge) {
    return (
      <main className="page">
        <section className="panel form-panel">
          <h1>Challenge Not Found</h1>
          <p className="hint">{error || 'This limited challenge may have ended or been removed.'}</p>
          <Link className="button primary" to="/guest-challenge">
            Create Challenge
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <p className="hero-kicker">Guest Challenge</p>
        <h1>{challenge.title}</h1>
        <p>{challenge.creatorName}</p>
        <div className="stats-cards">
          <article>
            <p className="metric">{challenge.maxPlayers}</p>
            <p>Players</p>
          </article>
          <article>
            <p className="metric">{challenge.durationDays}</p>
            <p>Days</p>
          </article>
          <article>
            <p className="metric">{challenge.attemptsPerDay}</p>
            <p>Attempts/day</p>
          </article>
        </div>
        <div className="hero-actions">
          {challenge.selectedExercises.map((exercise) => {
            const workout = CHALLENGES.find((item) => item.id === exercise)
            return workout ? <Link className="button ghost" to={`/guest/${challenge.code}/workout/${exercise}`} key={exercise}>{workout.name.replace(' Challenge', '')}</Link> : null
          })}
          <Link className="button ghost" to={`/guest/${challenge.code}/scoreboard`}>
            Scoreboard
          </Link>
        </div>
      </section>
    </main>
  )
}

export function GuestScoreboardPage() {
  const { challengeCode = '' } = useParams()
  const [challenge, setChallenge] = useState<GuestChallengeRecord | null>(null)
  const [rows, setRows] = useState<GuestScoreboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const dailyWinningScore = Math.max(...rows.map((row) => row.dailyBestScore), 0)
  const overallWinningScore = Math.max(...rows.map((row) => row.overallScore), 0)
  const exerciseColumns = challenge?.selectedExercises?.length
    ? challenge.selectedExercises
    : ['squat', 'burpee', 'high-knees', 'lunges'] as ExerciseType[]

  useEffect(() => {
    if (!challengeCode) {
      return
    }

    void Promise.all([getGuestChallenge(challengeCode), getGuestScoreboard(challengeCode)])
      .then(([challengePayload, scoreboard]) => {
        setChallenge(challengePayload)
        setRows(scoreboard)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [challengeCode])

  if (loading) {
    return (
      <main className="page">
        <section className="panel">
          <p>Loading scoreboard...</p>
        </section>
      </main>
    )
  }

  if (!challenge) {
    return <Navigate to="/guest-challenge" replace />
  }

  return (
    <main className="page">
      <section className="panel">
        <p className="hero-kicker">Scoreboard</p>
        <h1>{challenge.title}</h1>
        <p className="hint">Sharable scoreboard link: {buildUrl(`/guest/${challenge.code}/scoreboard`)}</p>
        <div className="leaderboard-grid">
          <section>
            <h2>Daily</h2>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Best Score</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td>-</td>
                    <td>Waiting for players</td>
                    <td>-</td>
                    <td>-</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.guestName}>
                      <td>{row.rank}</td>
                      <td>{row.guestName}</td>
                      <td className={row.dailyBestScore === dailyWinningScore && row.dailyBestScore > 0 ? 'winner-score' : undefined}>
                        {row.dailyBestScore}
                      </td>
                      <td>{row.attemptsToday}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
          <section>
            <h2>Overall</h2>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  {exerciseColumns.map((exercise) => {
                    const workout = CHALLENGES.find((item) => item.id === exercise)
                    return <th key={exercise}>{workout?.name.replace(' Challenge', '') ?? exercise} score</th>
                  })}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td>-</td>
                    <td>Challenge in progress</td>
                    {exerciseColumns.map((exercise) => <td key={exercise}>-</td>)}
                    <td>-</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.guestName}>
                      <td>{row.rank}</td>
                      <td>{row.guestName}</td>
                      {exerciseColumns.map((exercise) => <td key={exercise}>{row.exerciseScores[exercise] ?? 0}</td>)}
                      <td className={row.overallScore === overallWinningScore && row.overallScore > 0 ? 'winner-score' : undefined}>
                        {row.overallScore}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      </section>
    </main>
  )
}
