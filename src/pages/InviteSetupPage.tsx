import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { completeInviteSetup, getInviteSetupContext } from '../lib/supabaseApi'
import type { InviteSetupContext } from '../types'

type SetupForm = {
  organizationName: string
  countryCode: string
  startDate: string
  endDate: string
  enabledSquat: boolean
  enabledBurpee: boolean
  displayMessage: string
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
    displayMessage: '',
  })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launchPath, setLaunchPath] = useState<string | null>(null)

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
        }))
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
        displayMessage: form.displayMessage,
      })

      setLaunchPath(result.launchUrlPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete setup.')
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
          <div className="panel">
            <h2>Setup complete</h2>
            <p>Share this URL with your employees:</p>
            <p>
              <a href={launchPath}>{launchPath}</a>
            </p>
            <p className="hint">Use this page on iPad for start flow and open leaderboard link on monitor.</p>
          </div>
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

            <label>
              <input
                type="checkbox"
                checked={form.enabledSquat}
                onChange={(event) => setForm((state) => ({ ...state, enabledSquat: event.target.checked }))}
              />
              Include squats
            </label>

            <label>
              <input
                type="checkbox"
                checked={form.enabledBurpee}
                onChange={(event) => setForm((state) => ({ ...state, enabledBurpee: event.target.checked }))}
              />
              Include jumping jacks
            </label>

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
              {busy ? 'Saving setup...' : 'Complete Setup'}
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
