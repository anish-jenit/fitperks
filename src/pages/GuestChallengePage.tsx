import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { createGuestChallenge, getGuestChallenge, getGuestScoreboard } from '../lib/supabaseApi'
import { getLastGuestChallengeCode, getLastGuestName, getOrCreateGuestCreatorKey, saveGuestJoinContext } from '../lib/storage'
import type { GuestChallengeRecord, GuestScoreboardRow } from '../types'

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
  const [challengeCode, setChallengeCode] = useState(() => getLastGuestChallengeCode())
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedCode = challengeCode.trim().toLowerCase()

    if (!guestName.trim() || !normalizedCode) {
      setError('Guest name and challenge code are required.')
      return
    }

    saveGuestJoinContext({
      guestName,
      challengeCode: normalizedCode,
    })
    navigate(`/guest/${normalizedCode}`)
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <p className="hero-kicker">Join Challenge</p>
        <h1>Enter Challenge Code</h1>
        <p className="hint">Use the guest name and challenge code shared by the challenge creator.</p>

        {error ? <p className="error">{error}</p> : null}

        <form className="stack" onSubmit={onSubmit}>
          <label>
            Guest name
            <input value={guestName} onChange={(event) => setGuestName(event.target.value)} maxLength={80} required />
          </label>
          <label>
            Challenge code
            <input
              value={challengeCode}
              onChange={(event) => setChallengeCode(event.target.value)}
              placeholder="weekend-move-abc123"
              maxLength={96}
              required
            />
          </label>
          <button className="button primary" type="submit">
            Join Challenge
          </button>
        </form>
      </section>
    </main>
  )
}

export function GuestChallengePage() {
  const [title, setTitle] = useState('Weekend Move Challenge')
  const [creatorName, setCreatorName] = useState('')
  const [durationDays, setDurationDays] = useState(3)
  const [attemptsPerDay, setAttemptsPerDay] = useState(3)
  const [created, setCreated] = useState<GuestChallengeRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setBusy(true)
      setError(null)

      const challenge = await createGuestChallenge({
        creatorKey: getOrCreateGuestCreatorKey(),
        creatorName,
        title,
        durationDays,
        attemptsPerDay,
      })
      setCreated(challenge)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create guest challenge.')
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

        {error ? <p className="error">{error}</p> : null}

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
            <p className="hint">Daily scoreboard uses the best 3 attempts when available.</p>
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
            <div className="settings-grid">
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
            </div>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Creating...' : 'Create Share Link'}
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
          <Link className="button primary" to={`/guest/${challenge.code}/workout/squat`}>
            Squats
          </Link>
          <Link className="button ghost" to={`/guest/${challenge.code}/workout/burpee`}>
            Jumping Jacks
          </Link>
          <Link className="button ghost" to={`/guest/${challenge.code}/workout/high-knees`}>
            High Knees
          </Link>
          <Link className="button ghost" to={`/guest/${challenge.code}/workout/lunges`}>
            Lunges
          </Link>
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
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td>-</td>
                    <td>Challenge in progress</td>
                    <td>-</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.guestName}>
                      <td>{row.rank}</td>
                      <td>{row.guestName}</td>
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
