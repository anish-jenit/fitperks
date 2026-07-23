import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getOrganizationTrial, getOrganizationTrialScoreboard } from '../lib/supabaseApi'
import type { OrganizationTrialRecord, OrganizationTrialScoreboardRow } from '../types'

function buildUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}

function formatTimeRemaining(expiresAt: string): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now())
  const hours = Math.floor(remaining / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function TrialUrls({ trial }: { trial: OrganizationTrialRecord }) {
  const [copied, setCopied] = useState<string | null>(null)
  const urls = [
    ['Quick-start workout URL', buildUrl(trial.workoutUrlPath)],
    ...(trial.enableNicknames || trial.enableTeamNames ? [['Live scoreboard URL', buildUrl(trial.scoreboardUrlPath)]] : []),
  ]

  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(value)
    window.setTimeout(() => setCopied(null), 1400)
  }

  return (
    <div className="trial-url-list">
      {urls.map(([label, url]) => (
        <label key={label}>
          {label}
          <div className="trial-url-row">
            <input value={url} readOnly />
            <button className="button ghost button-small" type="button" onClick={() => void copy(url)}>
              {copied === url ? 'Copied' : 'Copy'}
            </button>
          </div>
        </label>
      ))}
    </div>
  )
}

export function TrialCodePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState(() => searchParams.get('code') ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = code.trim().toLowerCase()
    if (!normalized) {
      setError('Enter the organization trial code.')
      return
    }

    try {
      setError(null)
      const trial = await getOrganizationTrial(normalized)
      navigate(`/trial/${trial.code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This trial code is not available.')
    }
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <p className="hero-kicker">Organization demo</p>
        <h1>Enter trial code</h1>
        <p>Use the code shared by your FitPerks contact to open the live organization demo.</p>
        {error ? <p className="error">{error}</p> : null}
        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label>
            Trial or organization code
            <input value={code} onChange={(event) => setCode(event.target.value)} autoCapitalize="none" autoCorrect="off" required />
          </label>
          <button className="button primary" type="submit">Open demo</button>
        </form>
      </section>
    </main>
  )
}

export function TrialExperiencePage() {
  const { trialCode = '' } = useParams()
  const location = useLocation()
  const [trial, setTrial] = useState<OrganizationTrialRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState('')

  const isWorkoutStart = location.pathname.endsWith('/workout')

  useEffect(() => {
    if (!trialCode) return
    void getOrganizationTrial(trialCode)
      .then((nextTrial) => {
        setTrial(nextTrial)
        setRemaining(formatTimeRemaining(nextTrial.expiresAt))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load this organization trial.'))
  }, [trialCode])

  useEffect(() => {
    if (!trial) return
    const timer = window.setInterval(() => setRemaining(formatTimeRemaining(trial.expiresAt)), 1000)
    return () => window.clearInterval(timer)
  }, [trial])

  if (!trialCode) return <Navigate to="/demo" replace />

  if (error) {
    return (
      <main className="page"><section className="panel form-panel"><h1>Trial unavailable</h1><p className="hint">{error}</p><Link className="button primary" to="/demo">Try another code</Link></section></main>
    )
  }

  if (!trial) {
    return <main className="page"><section className="panel"><p>Loading organization demo...</p></section></main>
  }

  return (
    <main className="page trial-experience-page">
      <section className="panel form-panel trial-panel trial-experience-panel">
        <p className="hero-kicker">Organization trial</p>
        <h1>{trial.organizationName}</h1>
        <div className="trial-org-meta">
          <span>{trial.organizationCode} · {trial.countryCode.toUpperCase()}</span>
          <span className="trial-session-status">Session ends in <strong>{remaining}</strong></span>
        </div>
        <div className="trial-accent-rule" aria-hidden="true" />
        {trial.displayMessage ? <p className="trial-display-message">{trial.displayMessage}</p> : null}

        {isWorkoutStart ? (
          <div className="stack trial-quick-start">
            <h2>Quick-start workout</h2>
            <p>Complete jumping jacks first, then squats after a short reset.</p>
            <div className="hero-actions trial-workout-actions">
              <Link className="button primary" to={`/trial/${trial.code}/workout/burpee?camera=1`}>Start demo</Link>
              <Link className="button ghost" to={`/trial/${trial.code}/workout/plank?camera=1`}>Plank challenge</Link>
            </div>
            <Link className="button ghost trial-details-link" to={`/trial/${trial.code}`}>View trial details and URLs</Link>
          </div>
        ) : (
          <div className="stack">
            <TrialUrls trial={trial} />
            <div className="hero-actions">
              <Link className="button primary" to={trial.workoutUrlPath}>Open quick-start workout</Link>
              {trial.enableNicknames || trial.enableTeamNames ? <Link className="button ghost" to={trial.scoreboardUrlPath}>Open live scoreboard</Link> : null}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export function TrialScoreboardPage() {
  const { trialCode = '' } = useParams()
  const [trial, setTrial] = useState<OrganizationTrialRecord | null>(null)
  const [rows, setRows] = useState<OrganizationTrialScoreboardRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!trialCode) return
    let active = true
    async function load() {
      try {
        const [nextTrial, nextRows] = await Promise.all([getOrganizationTrial(trialCode), getOrganizationTrialScoreboard(trialCode)])
        if (active) {
          setTrial(nextTrial)
          setRows(nextRows)
          setError(null)
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to refresh the trial scoreboard.')
      }
    }
    void load()
    const refresh = window.setInterval(() => void load(), 4000)
    return () => {
      active = false
      window.clearInterval(refresh)
    }
  }, [trialCode])

  const topScore = useMemo(() => Math.max(...rows.map((row) => row.totalScore), 0), [rows])
  const bestScores = useMemo(() => ({
    squat: Math.max(...rows.map((row) => row.squatScore ?? 0), 0),
    jumpingJacks: Math.max(...rows.map((row) => row.jumpingJacksScore ?? 0), 0),
    overall: topScore,
  }), [rows, topScore])

  if (!trialCode) return <Navigate to="/demo" replace />
  if (error && !trial) return <main className="page"><section className="panel form-panel"><h1>Trial unavailable</h1><p className="hint">{error}</p></section></main>
  if (trial && !trial.enableNicknames && !trial.enableTeamNames) {
    return (
      <main className="page">
        <section className="panel form-panel">
          <p className="hero-kicker">Organization demo</p>
          <h1>{trial.organizationName}</h1>
          <p className="hint">Scoreboard is not enabled for this demo.</p>
          <div className="hero-actions"><Link className="button primary" to={`/trial/${trialCode}/workout`}>Back to trial</Link></div>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <p className="hero-kicker">Live trial scoreboard</p>
        <h1>{trial?.organizationName ?? 'Organization trial'}</h1>
        <p className="hint">Updates automatically while the trial is active.</p>
        {error ? <p className="error">{error}</p> : null}
        <section className="trial-score-summary" aria-labelledby="trial-leading-scores">
          <h2 id="trial-leading-scores">Leading scores</h2>
          <dl>
            <div><dt>Squat</dt><dd>{bestScores.squat}<span>pts</span></dd></div>
            <div><dt>Jumping jacks</dt><dd>{bestScores.jumpingJacks}<span>pts</span></dd></div>
            <div><dt>Overall</dt><dd>{bestScores.overall}<span>pts</span></dd></div>
          </dl>
        </section>
        <div className="scoreboard-list trial-scoreboard-list">
          {rows.length === 0 ? <div className="scoreboard-empty">Waiting for the first workout</div> : rows.map((row) => (
            <article className={`scoreboard-row ${row.totalScore === topScore && topScore > 0 ? 'scoreboard-row-winner' : ''}`} key={`${row.displayName}-${row.teamName}`}>
              <div className="scoreboard-rank">#{row.rank}</div>
              <div className="scoreboard-player">
                <strong className="scoreboard-player-name">{row.displayName}</strong>
                <span className="scoreboard-player-meta">
                  {trial?.enableNicknames && trial.enableTeamNames ? `${row.teamName} · ` : ''}SQ {row.squatScore ?? '-'} · JJ {row.jumpingJacksScore ?? '-'}
                </span>
              </div>
              <div className="scoreboard-score"><strong>{row.totalScore}</strong><span>points</span></div>
            </article>
          ))}
        </div>
        <div className="hero-actions"><Link className="button primary" to={`/trial/${trialCode}/workout`}>Open workout</Link><Link className="button ghost" to={`/trial/${trialCode}`}>Trial details</Link></div>
      </section>
    </main>
  )
}
