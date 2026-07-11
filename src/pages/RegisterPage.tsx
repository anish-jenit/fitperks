import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { joinOrganizationAndRegister } from '../lib/supabaseApi'
import { hasSupabaseConfig } from '../lib/supabase'
import { saveParticipantProfile, setConfiguredOrganizationCode } from '../lib/storage'

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const text = error.message.toLowerCase()
  return text.includes('load failed') || text.includes('failed to fetch') || text.includes('network')
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [organizationCode, setOrganizationCode] = useState('')
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!organizationCode.trim() || !name.trim() || !team.trim()) {
      setError('Organization code, name, and team are required.')
      return
    }

    setSaving(true)
    setError(null)

    if (!hasSupabaseConfig) {
      setConfiguredOrganizationCode(organizationCode)
      saveParticipantProfile({
        id: crypto.randomUUID(),
        organizationId: 'demo-org',
        organizationName: 'Demo Organization',
        organizationCode: organizationCode.trim(),
        challengeId: 'demo-challenge',
        name: name.trim(),
        team: team.trim(),
        teamId: 'demo-team',
        email: email.trim() || undefined,
      })
      navigate('/challenges')
      setSaving(false)
      return
    }

    try {
      const participant = await joinOrganizationAndRegister({
        organizationCode,
        name,
        team,
        email,
      })
      setConfiguredOrganizationCode(participant.organizationCode)
      saveParticipantProfile(participant)
      navigate('/challenges')
    } catch (err) {
      if (isNetworkFailure(err)) {
        setConfiguredOrganizationCode(organizationCode)
        saveParticipantProfile({
          id: crypto.randomUUID(),
          organizationId: 'demo-org',
          organizationName: 'Demo Organization',
          organizationCode: organizationCode.trim(),
          challengeId: 'demo-challenge',
          name: name.trim(),
          team: team.trim(),
          teamId: 'demo-team',
          email: email.trim() || undefined,
        })
        navigate('/challenges')
        return
      }

      setError(err instanceof Error ? err.message : 'Unable to register participant.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <section className="panel form-panel">
        <h1>Participant Registration</h1>
        <p>Create your profile to join team challenges.</p>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            Organization code
            <input
              value={organizationCode}
              onChange={(event) => setOrganizationCode(event.target.value)}
              placeholder="COMPANYA2026"
              maxLength={80}
              required
            />
          </label>

          <label>
            Name or nickname
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex"
              maxLength={60}
              required
            />
          </label>

          <label>
            Team name
            <input
              value={team}
              onChange={(event) => setTeam(event.target.value)}
              placeholder="Engineering"
              maxLength={60}
              required
            />
          </label>

          <label>
            Optional email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="alex@company.com"
              maxLength={120}
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <button type="submit" className="button primary" disabled={saving}>
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </form>
        <Link className="inline-link" to="/">
          Back to home
        </Link>
      </section>
    </main>
  )
}
