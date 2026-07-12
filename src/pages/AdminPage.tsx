import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { adminSignIn, signOut, supabase, useFlowStubs } from '../lib/supabase'
import {
  createOrganization,
  createOrganizationInvite,
  downloadCsv,
  getActiveChallenge,
  getChallengeHistory,
  getCurrentAdminUser,
  getIndividualLeaderboard,
  getApplicationSettings,
  getOrganizationInvites,
  getOrganizations,
  toCsv,
  updateApplicationSettings,
  updateChallengeConfig,
} from '../lib/supabaseApi'
import type { ApplicationSettings, ChallengeRecord, OrganizationInviteRecord, OrganizationRecord } from '../types'

type LoginState = {
  email: string
  password: string
}

type InviteDraft = {
  organizationCode: string
  pocEmail: string
  countryCode: string
}

type OrganizationDraft = {
  name: string
  organizationCode: string
  countryCode: string
  pocEmail: string
  allowedEmailDomains: string
}

type PlatformTab = 'defaults' | 'organizations'

function getAdminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

export function AdminPage() {
  const [login, setLogin] = useState<LoginState>({ email: '', password: '' })
  const [authenticated, setAuthenticated] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeChallenge, setActiveChallenge] = useState<ChallengeRecord | null>(null)
  const [challengeHistory, setChallengeHistory] = useState<ChallengeRecord[]>([])
  const [draft, setDraft] = useState<ChallengeRecord | null>(null)
  const [platformTab, setPlatformTab] = useState<PlatformTab>('defaults')
  const [applicationSettings, setApplicationSettings] = useState<ApplicationSettings | null>(null)
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([])
  const [organizationInvites, setOrganizationInvites] = useState<OrganizationInviteRecord[]>([])
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>({ organizationCode: '', pocEmail: '', countryCode: '' })
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [organizationDraft, setOrganizationDraft] = useState<OrganizationDraft>({
    name: '',
    organizationCode: '',
    countryCode: '',
    pocEmail: '',
    allowedEmailDomains: '',
  })

  useEffect(() => {
    void hydrate()
  }, [])

  async function hydrate() {
    try {
      setLoading(true)

      if (useFlowStubs) {
        setAuthenticated(true)
        setIsPlatformAdmin(true)
        setApplicationSettings(await getApplicationSettings())
        setOrganizations([])
        setOrganizationInvites([])
        setMessage('Stub mode active: admin and POC invite flow is running locally without Supabase.')
        setError(null)
        return
      }

      const { data } = await supabase.auth.getSession()
      const admin = await getCurrentAdminUser()
      if (!data.session && !admin) {
        setAuthenticated(false)
        return
      }

      if (!admin) {
        setAuthenticated(false)
        setError('You are signed in but not assigned as an admin user.')
        return
      }

      setAuthenticated(true)
      setIsPlatformAdmin(admin.role === 'platform_admin')

      if (admin.role === 'platform_admin') {
        const [nextSettings, nextOrganizations, nextInvites, nextHistory] = await Promise.all([
          getApplicationSettings(),
          getOrganizations(),
          getOrganizationInvites(),
          getChallengeHistory(),
        ])
        setApplicationSettings(nextSettings)
        setOrganizations(nextOrganizations)
        setOrganizationInvites(nextInvites)
        setChallengeHistory(nextHistory)
        setActiveChallenge(null)
        setDraft(null)
      } else {
        const [nextActive, nextHistory] = await Promise.all([getActiveChallenge(), getChallengeHistory()])
        setActiveChallenge(nextActive)
        setDraft(nextActive)
        setChallengeHistory(nextHistory)
      }
    } catch (err) {
      setError(getAdminErrorMessage(err, 'Unable to load admin data.'))
    } finally {
      setLoading(false)
    }
  }

  async function onLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setBusy(true)
      setError(null)
      await adminSignIn(login.email, login.password)
      setAuthenticated(true)
      await hydrate()
    } catch (err) {
      setError(getAdminErrorMessage(err, 'Admin login failed.'))
    } finally {
      setBusy(false)
    }
  }

  async function onSaveChallengeConfig() {
    if (!draft) {
      return
    }

    try {
      setBusy(true)
      setMessage(null)

      const hasStarted = dayjs(draft.start_date).isBefore(dayjs())
      if (hasStarted) {
        const confirmed = window.confirm(
          'This challenge has already started. Confirming will create an audit record and apply scoring changes.',
        )
        if (!confirmed) {
          return
        }
      }

      await updateChallengeConfig({
        challengeId: draft.id,
        patch: {
          start_date: draft.start_date,
          end_date: draft.end_date,
          timezone: draft.timezone,
          enabled_squat: draft.enabled_squat,
          enabled_burpee: draft.enabled_burpee,
          enabled_high_knees: draft.enabled_high_knees,
          enabled_lunges: draft.enabled_lunges,
          squat_points_per_rep: draft.squat_points_per_rep,
          burpee_points_per_rep: draft.burpee_points_per_rep,
          high_knees_points_per_rep: draft.high_knees_points_per_rep,
          lunges_points_per_rep: draft.lunges_points_per_rep,
          qualifying_threshold_type: draft.qualifying_threshold_type,
          qualifying_threshold_value: draft.qualifying_threshold_value,
          max_sessions_per_day: draft.max_sessions_per_day,
          team_qualification_type: draft.team_qualification_type,
          team_required_unique_members: draft.team_required_unique_members,
          team_required_participation_percent: draft.team_required_participation_percent,
        },
      })

      setMessage('Challenge configuration updated and audited.')
      await hydrate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save challenge configuration.')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveApplicationSettings() {
    if (!applicationSettings) {
      return
    }

    try {
      setBusy(true)
      setError(null)
      setMessage(null)
      const next = await updateApplicationSettings({
        squatPointsPerRep: applicationSettings.squat_points_per_rep,
        burpeePointsPerRep: applicationSettings.burpee_points_per_rep,
        highKneesPointsPerRep: applicationSettings.high_knees_points_per_rep,
        lungesPointsPerRep: applicationSettings.lunges_points_per_rep,
      })
      setApplicationSettings(next)
      setMessage('Application defaults updated. New organization challenges will use these point values.')
    } catch (err) {
      setError(getAdminErrorMessage(err, 'Unable to save application defaults.'))
    } finally {
      setBusy(false)
    }
  }

  async function onExportCsv() {
    if (!activeChallenge) {
      return
    }

    try {
      const rows = await getIndividualLeaderboard(activeChallenge.id, 'overall')
      const csv = toCsv(rows)
      const stamp = dayjs().format('YYYY-MM-DD_HH-mm')
      downloadCsv(csv, `fitperks-${activeChallenge.id}-leaderboard-${stamp}.csv`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed.')
    }
  }

  async function onGenerateInvite() {
    try {
      setBusy(true)
      setError(null)
      setMessage(null)

      const result = await createOrganizationInvite({
        organizationCode: inviteDraft.organizationCode,
        pocEmail: inviteDraft.pocEmail,
        countryCode: inviteDraft.countryCode,
      })

      const absoluteUrl = `${window.location.origin}${result.inviteUrlPath}`
      setGeneratedInviteUrl(absoluteUrl)
      if (isPlatformAdmin) {
        setOrganizationInvites(await getOrganizationInvites())
      }
      setMessage('Invite link created. Share it with the organization POC.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create invite link.')
    } finally {
      setBusy(false)
    }
  }

  async function onCreateOrganization() {
    try {
      setBusy(true)
      setError(null)
      setMessage(null)

      await createOrganization(organizationDraft)
      if (isPlatformAdmin) {
        setOrganizations(await getOrganizations())
      }
      setInviteDraft({
        organizationCode: organizationDraft.organizationCode.trim().toUpperCase(),
        pocEmail: organizationDraft.pocEmail.trim().toLowerCase(),
        countryCode: organizationDraft.countryCode.trim().toLowerCase(),
      })
      setMessage('Organization created. You can now generate its POC setup invite.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create organization.')
    } finally {
      setBusy(false)
    }
  }

  const readOnlyHistory = useMemo(
    () => challengeHistory.filter((c) => c.status === 'completed' || c.status === 'archived'),
    [challengeHistory],
  )

  if (loading) {
    return (
      <main className="page">
        <section className="panel">
          <p>Loading admin dashboard...</p>
        </section>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="page">
        <section className="panel form-panel">
          <h1>Admin Login</h1>
          <p>{useFlowStubs ? 'Stub mode enabled. Login is bypassed for local flow testing.' : 'Sign in with your Supabase admin account.'}</p>
          {error ? <p className="error">{error}</p> : null}
          <form className="stack" onSubmit={onLoginSubmit}>
            <label>
              Email
              <input
                type="email"
                value={login.email}
                onChange={(event) => setLogin((state) => ({ ...state, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={login.password}
                onChange={(event) => setLogin((state) => ({ ...state, password: event.target.value }))}
                required
              />
            </label>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>{isPlatformAdmin ? 'Platform Admin Dashboard' : 'Organization Admin Dashboard'}</h1>
        <p>
          {isPlatformAdmin
            ? 'Manage application defaults, organizations, onboarding links, and challenge history.'
            : 'Organization admin access: challenge configuration, scoring, streak rules, and exports.'}
        </p>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p>{message}</p> : null}

        <div className="admin-actions">
          {!isPlatformAdmin ? (
            <button className="button ghost" onClick={() => void onExportCsv()}>
              Export Organization CSV
            </button>
          ) : null}
          <button
            className="button ghost"
            onClick={() => {
              if (useFlowStubs) {
                setAuthenticated(false)
                setDraft(null)
                setMessage('Stub mode session closed. Refresh to re-enter admin stub mode.')
                return
              }

              void signOut().then(() => {
                setAuthenticated(false)
                setDraft(null)
              })
            }}
          >
            Sign Out
          </button>
        </div>

        {isPlatformAdmin ? (
          <>
            <div className="admin-tabs" role="tablist" aria-label="Platform admin functions">
              <button
                className={`admin-tab ${platformTab === 'defaults' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={platformTab === 'defaults'}
                onClick={() => setPlatformTab('defaults')}
              >
                Application Defaults
              </button>
              <button
                className={`admin-tab ${platformTab === 'organizations' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={platformTab === 'organizations'}
                onClick={() => setPlatformTab('organizations')}
              >
                Organizations & Invites
              </button>
            </div>

            {platformTab === 'defaults' ? (
              <section className="panel settings-panel">
                <h2>Application Point Defaults</h2>
                <p>These values apply to newly created organization challenges. Existing challenges keep their current scoring.</p>
                {applicationSettings ? (
                  <div className="stack">
                    <div className="settings-grid admin-scoring-grid">
                      {([
                        ['squat_points_per_rep', 'Squats'],
                        ['burpee_points_per_rep', 'Jumping jacks'],
                        ['high_knees_points_per_rep', 'High knees'],
                        ['lunges_points_per_rep', 'Lunges'],
                      ] as const).map(([field, label]) => (
                        <label key={field}>
                          {label} points per rep
                          <input
                            type="number"
                            min={0}
                            value={applicationSettings[field]}
                            onChange={(event) =>
                              setApplicationSettings((current) =>
                                current ? { ...current, [field]: Number(event.target.value) } : current,
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <p className="hint">
                      Current defaults: {applicationSettings.squat_points_per_rep} squat, {applicationSettings.burpee_points_per_rep}{' '}
                      jumping jack, {applicationSettings.high_knees_points_per_rep} high knees, {applicationSettings.lunges_points_per_rep}{' '}
                      lunge points per rep.
                    </p>
                    <button className="button primary" type="button" onClick={() => void onSaveApplicationSettings()} disabled={busy}>
                      {busy ? 'Saving...' : 'Save Application Defaults'}
                    </button>
                  </div>
                ) : (
                  <p>Application defaults are unavailable.</p>
                )}
              </section>
            ) : (
              <section className="panel settings-panel">
                <h2>Organizations & Invites</h2>
                <p>Create organizations, generate POC setup links, and review every organization onboarding record.</p>

                <div className="admin-management-grid">
                  <div className="admin-management-block">
                    <h3 className="admin-subsection-title">Create organization</h3>
                    <div className="stack">
                      <label>
                        Organization name
                        <input
                          value={organizationDraft.name}
                          onChange={(event) => setOrganizationDraft((state) => ({ ...state, name: event.target.value }))}
                          placeholder="Citi"
                        />
                      </label>
                      <label>
                        Organization code
                        <input
                          value={organizationDraft.organizationCode}
                          onChange={(event) => setOrganizationDraft((state) => ({ ...state, organizationCode: event.target.value }))}
                          placeholder="CITI2026"
                        />
                      </label>
                      <div className="settings-grid admin-window-grid">
                        <label>
                          Country code
                          <input
                            value={organizationDraft.countryCode}
                            onChange={(event) => setOrganizationDraft((state) => ({ ...state, countryCode: event.target.value }))}
                            placeholder="sg"
                          />
                        </label>
                        <label>
                          POC email
                          <input
                            type="email"
                            value={organizationDraft.pocEmail}
                            onChange={(event) => setOrganizationDraft((state) => ({ ...state, pocEmail: event.target.value }))}
                            placeholder="poc@company.com"
                          />
                        </label>
                      </div>
                      <label>
                        Allowed email domains
                        <input
                          value={organizationDraft.allowedEmailDomains}
                          onChange={(event) => setOrganizationDraft((state) => ({ ...state, allowedEmailDomains: event.target.value }))}
                          placeholder="company.com, subsidiary.com"
                        />
                      </label>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => void onCreateOrganization()}
                        disabled={busy || !organizationDraft.name.trim() || !organizationDraft.organizationCode.trim() || !organizationDraft.countryCode.trim()}
                      >
                        {busy ? 'Creating...' : 'Create Organization'}
                      </button>
                    </div>
                  </div>

                  <div className="admin-management-block">
                    <h3 className="admin-subsection-title">Generate POC setup URL</h3>
                    <div className="stack">
                      <label>
                        Organization code
                        <input
                          value={inviteDraft.organizationCode}
                          onChange={(event) => setInviteDraft((state) => ({ ...state, organizationCode: event.target.value }))}
                          placeholder="CITI2026"
                        />
                      </label>
                      <label>
                        POC email
                        <input
                          type="email"
                          value={inviteDraft.pocEmail}
                          onChange={(event) => setInviteDraft((state) => ({ ...state, pocEmail: event.target.value }))}
                          placeholder="poc@company.com"
                        />
                      </label>
                      <label>
                        Country code
                        <input
                          value={inviteDraft.countryCode}
                          onChange={(event) => setInviteDraft((state) => ({ ...state, countryCode: event.target.value }))}
                          placeholder="sg"
                        />
                      </label>
                      <button className="button primary" type="button" onClick={() => void onGenerateInvite()} disabled={busy || !inviteDraft.organizationCode.trim() || !inviteDraft.pocEmail.trim() || !inviteDraft.countryCode.trim()}>
                        {busy ? 'Generating...' : 'Generate Invite URL'}
                      </button>
                      {generatedInviteUrl ? (
                        <label>
                          Latest setup URL
                          <input value={generatedInviteUrl} readOnly />
                        </label>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="admin-list-block">
                  <h3 className="admin-subsection-title">Organization records</h3>
                  {organizations.length === 0 ? <p>No organizations found.</p> : (
                    <div className="table-scroll"><table>
                      <thead><tr><th>Organization</th><th>Code</th><th>POC</th><th>Country</th><th>Status</th></tr></thead>
                      <tbody>{organizations.map((organization) => (
                        <tr key={organization.id}>
                          <td>{organization.name}</td>
                          <td>{organization.organization_code}</td>
                          <td>{organization.poc_email ?? 'Not set'}</td>
                          <td>{organization.country_code}</td>
                          <td>{organization.status}</td>
                        </tr>
                      ))}</tbody>
                    </table></div>
                  )}
                </div>

                <div className="admin-list-block">
                  <h3 className="admin-subsection-title">Generated invite URLs</h3>
                  {organizationInvites.length === 0 ? <p>No invite URLs generated yet.</p> : (
                    <div className="table-scroll"><table>
                      <thead><tr><th>Organization</th><th>POC</th><th>Status</th><th>Expires</th><th>Setup URL</th></tr></thead>
                      <tbody>{organizationInvites.map((invite) => {
                        const url = `${window.location.origin}/setup/${invite.token}`
                        return <tr key={invite.id}><td>{invite.organization_name} <span className="table-muted">({invite.organization_code})</span></td><td>{invite.poc_email}</td><td>{invite.status}</td><td>{dayjs(invite.expires_at).format('YYYY-MM-DD')}</td><td><a href={url}>{url}</a></td></tr>
                      })}</tbody>
                    </table></div>
                  )}
                </div>

                <div className="admin-list-block">
                  <h3 className="admin-subsection-title">Challenge history</h3>
                  {readOnlyHistory.length === 0 ? <p>No completed or archived challenges yet.</p> : (
                    <div className="table-scroll"><table><thead><tr><th>Organization</th><th>Challenge</th><th>Status</th><th>Window</th></tr></thead><tbody>{readOnlyHistory.map((item) => <tr key={item.id}><td>{organizations.find((organization) => organization.id === item.organization_id)?.name ?? item.organization_id}</td><td>{item.name}</td><td>{item.status}</td><td>{dayjs(item.start_date).format('YYYY-MM-DD')} to {dayjs(item.end_date).format('YYYY-MM-DD')}</td></tr>)}</tbody></table></div>
                  )}
                </div>
              </section>
            )}
          </>
        ) : null}

        {!isPlatformAdmin ? <section className="panel settings-panel">
          <h2>Active Challenge Configuration</h2>
          {!draft ? (
            <p>No active challenge found for this organization.</p>
          ) : (
            <div className="stack">
              <div>
                <h3 className="admin-subsection-title">Challenge window</h3>
                <div className="admin-window-grid">
                  <label>
                    Start date
                    <input
                      type="datetime-local"
                      value={dayjs(draft.start_date).format('YYYY-MM-DDTHH:mm')}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                start_date: dayjs(event.target.value).toISOString(),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    End date
                    <input
                      type="datetime-local"
                      value={dayjs(draft.end_date).format('YYYY-MM-DDTHH:mm')}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                end_date: dayjs(event.target.value).toISOString(),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    Challenge timezone
                    <input
                      value={draft.timezone}
                      onChange={(event) =>
                        setDraft((current) => (current ? { ...current, timezone: event.target.value } : current))
                      }
                    />
                  </label>
                </div>
              </div>

              <div>
                <h3 className="admin-subsection-title">Enabled exercises</h3>
                <div className="exercise-toggle-grid">
                  <label className="exercise-toggle-card">
                    <input
                      type="checkbox"
                      checked={draft.enabled_squat}
                      onChange={(event) =>
                        setDraft((current) => (current ? { ...current, enabled_squat: event.target.checked } : current))
                      }
                    />
                    <span>Squats</span>
                  </label>
                  <label className="exercise-toggle-card">
                    <input
                      type="checkbox"
                      checked={draft.enabled_burpee}
                      onChange={(event) =>
                        setDraft((current) => (current ? { ...current, enabled_burpee: event.target.checked } : current))
                      }
                    />
                    <span>Jumping jacks</span>
                  </label>
                  <label className="exercise-toggle-card">
                    <input
                      type="checkbox"
                      checked={draft.enabled_high_knees}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, enabled_high_knees: event.target.checked } : current,
                        )
                      }
                    />
                    <span>High knees</span>
                  </label>
                  <label className="exercise-toggle-card">
                    <input
                      type="checkbox"
                      checked={draft.enabled_lunges}
                      onChange={(event) =>
                        setDraft((current) => (current ? { ...current, enabled_lunges: event.target.checked } : current))
                      }
                    />
                    <span>Lunges</span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="admin-subsection-title">Scoring</h3>
                <div className="settings-grid admin-scoring-grid">
                <label>
                  Squat points per rep
                  <input
                    type="number"
                    min={0}
                    value={draft.squat_points_per_rep}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              squat_points_per_rep: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Jumping jack points per rep
                  <input
                    type="number"
                    min={0}
                    value={draft.burpee_points_per_rep}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              burpee_points_per_rep: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  High knees points per rep
                  <input
                    type="number"
                    min={0}
                    value={draft.high_knees_points_per_rep}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              high_knees_points_per_rep: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Lunge points per rep
                  <input
                    type="number"
                    min={0}
                    value={draft.lunges_points_per_rep}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              lunges_points_per_rep: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                </div>
              </div>

              <div>
                <h3 className="admin-subsection-title">Participation rules</h3>
                <div className="settings-grid admin-rules-grid">
                <label>
                  Minimum qualifying reps or points
                  <input
                    type="number"
                    min={1}
                    value={draft.qualifying_threshold_value}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              qualifying_threshold_value: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Max sessions per day
                  <input
                    type="number"
                    min={1}
                    value={draft.max_sessions_per_day}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              max_sessions_per_day: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Team threshold unique participants
                  <input
                    type="number"
                    min={1}
                    value={draft.team_required_unique_members}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              team_required_unique_members: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  Team threshold participation %
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.team_required_participation_percent}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              team_required_participation_percent: Number(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
                </div>
              </div>

              <p className="hint">
                Scoring preview: squat {draft.squat_points_per_rep}/rep, jumping jack {draft.burpee_points_per_rep}
                /rep, high knees {draft.high_knees_points_per_rep}/rep, lunge {draft.lunges_points_per_rep}/rep,
                qualifying threshold {draft.qualifying_threshold_value} ({draft.qualifying_threshold_type}), max
                sessions/day {draft.max_sessions_per_day}.
              </p>

              <button className="button primary" onClick={() => void onSaveChallengeConfig()} disabled={busy}>
                {busy ? 'Saving...' : 'Save Challenge Configuration'}
              </button>
            </div>
          )}
        </section> : null}

        {!isPlatformAdmin ? <section className="panel settings-panel">
          <h2>Challenge History</h2>
          <p>Completed and cancelled challenges remain available here for reference.</p>
          {readOnlyHistory.length === 0 ? (
            <p>No completed or archived challenge history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Exercises</th>
                  <th>Points / rep</th>
                  <th>Challenge window</th>
                  <th>Timezone</th>
                </tr>
              </thead>
              <tbody>
                {readOnlyHistory.map((item) => (
                  (() => {
                    const exercises = [
                      item.enabled_squat ? 'Squats' : null,
                      item.enabled_burpee ? 'Jumping jacks' : null,
                      item.enabled_high_knees ? 'High knees' : null,
                      item.enabled_lunges ? 'Lunges' : null,
                    ].filter(Boolean).join(' · ')

                    return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.status}</td>
                    <td>{exercises || 'None'}</td>
                    <td>
                      {item.squat_points_per_rep} · {item.burpee_points_per_rep} · {item.high_knees_points_per_rep} ·{' '}
                      {item.lunges_points_per_rep}
                    </td>
                    <td>
                      {dayjs(item.start_date).format('YYYY-MM-DD HH:mm')} to {dayjs(item.end_date).format('YYYY-MM-DD HH:mm')}
                    </td>
                    <td>{item.timezone}</td>
                  </tr>
                    )
                  })()
                ))}
              </tbody>
            </table>
          )}
        </section> : null}
      </section>
    </main>
  )
}
