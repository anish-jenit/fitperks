import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cancelInviteChallenge, completeInviteSetup, getInviteSetupContext } from '../lib/supabaseApi'
import type { InviteSetupContext } from '../types'

type SetupForm = {
  organizationName: string
  countryCode: string
  startDate: string
  endDate: string
  enabledSquat: boolean
  enabledBurpee: boolean
  enabledHighKnees: boolean
  enabledLunges: boolean
  displayMessage: string
  timezone: string
}

export function InviteSetupPage() {
  const { token: tokenParam } = useParams()
  const token = tokenParam ?? ''

  const [context, setContext] = useState<InviteSetupContext | null>(null)
  const [form, setForm] = useState<SetupForm>({
    organizationName: '',
    countryCode: '',
    startDate: dayjs().add(1, 'day').startOf('day').toISOString(),
    endDate: dayjs().add(14, 'day').endOf('day').toISOString(),
    enabledSquat: true,
    enabledBurpee: true,
    enabledHighKnees: true,
    enabledLunges: true,
    displayMessage: '',
    timezone: 'UTC',
  })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launchPath, setLaunchPath] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const setupPath = `/setup/${token}`

  const fullUrl = (path: string) => {
    if (typeof window === 'undefined') {
      return path
    }

    return new URL(path, window.location.origin).toString()
  }

  const dateRangeError = useMemo(() => {
    if (!form.startDate || !form.endDate) {
      return null
    }

    if (dayjs(form.endDate).isBefore(dayjs(form.startDate))) {
      return 'End date must be after start date.'
    }

    return null
  }, [form.endDate, form.startDate])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setError('Invite token is missing.')
      return
    }

    void getInviteSetupContext(token)
      .then((invite) => {
        setContext(invite)
        setForm((current) => ({
          ...current,
          organizationName: invite.organizationName,
          countryCode: invite.countryCode,
          startDate: invite.existingChallengeStartDate ?? current.startDate,
          endDate: invite.existingChallengeEndDate ?? current.endDate,
          timezone: invite.existingChallengeTimezone ?? current.timezone,
          enabledSquat: invite.existingEnabledSquat ?? current.enabledSquat,
          enabledBurpee: invite.existingEnabledBurpee ?? current.enabledBurpee,
          enabledHighKnees: invite.existingEnabledHighKnees ?? current.enabledHighKnees,
          enabledLunges: invite.existingEnabledLunges ?? current.enabledLunges,
          displayMessage: invite.existingChallengeDescription ?? current.displayMessage,
        }))
        if (invite.inviteStatus === 'accepted') {
          setLaunchPath(`/launch/${invite.countryCode}/${invite.organizationSlug}`)
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load invite setup context.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [token])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!context || dateRangeError) {
      return
    }

    try {
      setBusy(true)
      setError(null)

      const result = await completeInviteSetup({
        token: context.token,
        organizationName: form.organizationName,
        countryCode: form.countryCode,
        startDate: form.startDate,
        endDate: form.endDate,
        enabledSquat: form.enabledSquat,
        enabledBurpee: form.enabledBurpee,
        enabledHighKnees: form.enabledHighKnees,
        enabledLunges: form.enabledLunges,
        displayMessage: form.displayMessage,
        timezone: form.timezone,
      })

      setLaunchPath(result.launchUrlPath)
      setContext((current) => (current ? { ...current, inviteStatus: 'accepted' } : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete setup.')
    } finally {
      setBusy(false)
    }
  }

  async function onCancelChallenge() {
    if (!context || !window.confirm('Archive this challenge? The public launch URL will no longer accept workouts.')) {
      return
    }

    try {
      setBusy(true)
      setError(null)
      await cancelInviteChallenge(context.token)
      setCancelled(true)
      setLaunchPath(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel the challenge.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <main className="page">
        <section className="panel">
          <p>Loading invite setup...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <h1>Organization Setup</h1>
        <p>Set up your challenge basics and launch page.</p>
        <p className="hint">POC email: {context?.pocEmail ?? 'Unknown'}</p>

        {error ? <p className="error">{error}</p> : null}

        {launchPath ? (
          <div className="setup-result">
            <h2>{context?.inviteStatus === 'accepted' ? 'Challenge links' : 'Setup complete'}</h2>
            <div className="url-list">
              <article>
                <span>Setup URL</span>
                <a href={setupPath}>{fullUrl(setupPath)}</a>
              </article>
              <article>
                <span>Challenge URL</span>
                <a href={launchPath}>{fullUrl(launchPath)}</a>
              </article>
              <article>
                <span>Scoreboard URL</span>
                <a href={`${launchPath}/leaderboard`}>{fullUrl(`${launchPath}/leaderboard`)}</a>
              </article>
            </div>
            <p className="hint">Use the challenge URL for the workout station and the scoreboard URL for the live display.</p>
          </div>
        ) : null}

        {cancelled ? (
          <p className="error">This challenge has been cancelled. The setup link is no longer active.</p>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Organization
              <input
                value={form.organizationName}
                onChange={(event) => setForm((state) => ({ ...state, organizationName: event.target.value }))}
                required
              />
            </label>

            <label>
              Country code
              <input
                value={form.countryCode}
                onChange={(event) => setForm((state) => ({ ...state, countryCode: event.target.value }))}
                placeholder="us"
                required
              />
            </label>

            <label>
              Challenge timezone
              <input
                value={form.timezone}
                onChange={(event) => setForm((state) => ({ ...state, timezone: event.target.value }))}
                placeholder="Asia/Singapore"
                required
              />
              <span className="hint">Use an IANA timezone such as Asia/Singapore or America/New_York.</span>
            </label>

            <label>
              Challenge start date
              <input
                type="datetime-local"
                value={dayjs(form.startDate).format('YYYY-MM-DDTHH:mm')}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    startDate: dayjs(event.target.value).toISOString(),
                  }))
                }
                required
              />
            </label>

            <label>
              Challenge end date
              <input
                type="datetime-local"
                value={dayjs(form.endDate).format('YYYY-MM-DDTHH:mm')}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    endDate: dayjs(event.target.value).toISOString(),
                  }))
                }
                required
              />
            </label>

            <div className="exercise-toggle-grid">
              <label className="exercise-toggle-card">
                <input
                  type="checkbox"
                  checked={form.enabledSquat}
                  onChange={(event) => setForm((state) => ({ ...state, enabledSquat: event.target.checked }))}
                />
                <span>Squats</span>
              </label>
              <label className="exercise-toggle-card">
                <input
                  type="checkbox"
                  checked={form.enabledBurpee}
                  onChange={(event) => setForm((state) => ({ ...state, enabledBurpee: event.target.checked }))}
                />
                <span>Jumping jacks</span>
              </label>
              <label className="exercise-toggle-card">
                <input
                  type="checkbox"
                  checked={form.enabledHighKnees}
                  onChange={(event) => setForm((state) => ({ ...state, enabledHighKnees: event.target.checked }))}
                />
                <span>High knees</span>
              </label>
              <label className="exercise-toggle-card">
                <input
                  type="checkbox"
                  checked={form.enabledLunges}
                  onChange={(event) => setForm((state) => ({ ...state, enabledLunges: event.target.checked }))}
                />
                <span>Lunges</span>
              </label>
            </div>

            <label>
              Optional display message
              <input
                value={form.displayMessage}
                onChange={(event) => setForm((state) => ({ ...state, displayMessage: event.target.value }))}
                placeholder="Welcome to the challenge"
              />
            </label>

            {dateRangeError ? <p className="field-error">{dateRangeError}</p> : null}

            <button className="button primary" type="submit" disabled={busy || Boolean(dateRangeError)}>
              {busy ? 'Saving...' : context?.inviteStatus === 'accepted' ? 'Save Challenge Changes' : 'Complete Setup'}
            </button>
            {context?.inviteStatus === 'accepted' ? (
              <button className="button warn" type="button" onClick={() => void onCancelChallenge()} disabled={busy}>
                Cancel Challenge
              </button>
            ) : null}
          </form>
        )}

        <Link className="inline-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  )
}
