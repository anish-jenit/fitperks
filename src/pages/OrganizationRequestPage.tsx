import { useState } from 'react'
import { Link } from 'react-router-dom'
import { hasSupabaseConfig, supabase } from '../lib/supabase'

type OrganizationRequest = {
  organizationName: string
  contactName: string
  workEmail: string
  country: string
  expectedPlayers: string
  preferredWindow: string
  note: string
}

const initialRequest: OrganizationRequest = {
  organizationName: '',
  contactName: '',
  workEmail: '',
  country: '',
  expectedPlayers: '',
  preferredWindow: '',
  note: '',
}

export function OrganizationRequestPage() {
  const [request, setRequest] = useState<OrganizationRequest>(initialRequest)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof OrganizationRequest>(key: K, value: OrganizationRequest[K]) {
    setRequest((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!hasSupabaseConfig) {
      setError('The contact email service is not configured yet.')
      return
    }

    try {
      setBusy(true)

      const { error: functionError } = await supabase.functions.invoke('send-contact-email', {
        body: {
          name: request.contactName.trim(),
          email: request.workEmail.trim(),
          subject: `Organization challenge request: ${request.organizationName.trim()}`,
          message: [
            `Organization: ${request.organizationName.trim()}`,
            `Contact: ${request.contactName.trim()}`,
            `Work email: ${request.workEmail.trim()}`,
            `Country: ${request.country.trim()}`,
            `Expected participants: ${request.expectedPlayers}`,
            `Preferred window: ${request.preferredWindow.trim()}`,
            '',
            request.note.trim(),
          ].join('\n'),
        },
      })

      if (functionError) {
        throw functionError
      }

      setSent(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to send the organization request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <p className="hero-kicker">Organization</p>
        <h1>Challenge Request</h1>
        <p className="hint">For companies, schools, clubs, and institutions. We will reply with a setup URL after review.</p>

        <form className="stack" onSubmit={onSubmit}>
          <label>
            Organization
            <input
              value={request.organizationName}
              onChange={(event) => update('organizationName', event.target.value)}
              required
            />
          </label>
          <label>
            Contact name
            <input value={request.contactName} onChange={(event) => update('contactName', event.target.value)} required />
          </label>
          <label>
            Organization email
            <input
              type="email"
              value={request.workEmail}
              onChange={(event) => update('workEmail', event.target.value)}
              required
            />
          </label>
          <div className="settings-grid">
            <label>
              Country
              <input value={request.country} onChange={(event) => update('country', event.target.value)} required />
            </label>
            <label>
              Expected participants
              <input
                type="number"
                min={1}
                value={request.expectedPlayers}
                onChange={(event) => update('expectedPlayers', event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            Preferred challenge window
            <input
              value={request.preferredWindow}
              onChange={(event) => update('preferredWindow', event.target.value)}
              placeholder="Example: Aug 5-9"
            />
          </label>
          <label>
            Notes
            <textarea value={request.note} onChange={(event) => update('note', event.target.value)} rows={5} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          {sent ? <p className="hint">Your request was sent. We will reply to your organization email.</p> : null}
          <button className="button primary" type="submit" disabled={busy || sent}>
            {busy ? 'Sending Request...' : sent ? 'Request Sent' : 'Submit Request'}
          </button>
        </form>

        <Link className="inline-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  )
}
