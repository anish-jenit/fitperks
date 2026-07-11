import { useState } from 'react'
import { Link } from 'react-router-dom'

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

  function update<K extends keyof OrganizationRequest>(key: K, value: OrganizationRequest[K]) {
    setRequest((current) => ({ ...current, [key]: value }))
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const subject = encodeURIComponent(`Organization challenge request: ${request.organizationName}`)
    const body = encodeURIComponent(
      [
        `Organization: ${request.organizationName}`,
        `Contact: ${request.contactName}`,
        `Work email: ${request.workEmail}`,
        `Country: ${request.country}`,
        `Expected participants: ${request.expectedPlayers}`,
        `Preferred window: ${request.preferredWindow}`,
        '',
        request.note,
      ].join('\n'),
    )

    window.location.href = `mailto:admin@fitperks.org?subject=${subject}&body=${body}`
    setSent(true)
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
          {sent ? <p className="hint">Email draft opened. Send it from your organization email account.</p> : null}
          <button className="button primary" type="submit">
            Prepare Email
          </button>
        </form>

        <Link className="inline-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  )
}
