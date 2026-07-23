import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { AIDemoSettings } from '../admin/AIDemoSettings'
import { adminSignIn, signOut, supabase, useFlowStubs } from '../lib/supabase'
import {
  createOrganizationWithInvite,
  createOrganizationTrial,
  downloadCsv,
  getActiveChallenge,
  getChallengeHistory,
  getCurrentAdminUser,
  getIndividualLeaderboard,
  getApplicationSettings,
  getOrganizationInvites,
  getOrganizationTrials,
  getOrganizations,
  toCsv,
  updateApplicationSettings,
  updateChallengeConfig,
} from '../lib/supabaseApi'
import { DEFAULT_AI_DEMO_SETTINGS, type ApplicationSettings, type ChallengeRecord, type OrganizationInviteRecord, type OrganizationRecord, type OrganizationTrialRecord } from '../types'

type LoginState = {
  email: string
  password: string
}

type OrganizationDraft = {
  name: string
  organizationCode: string
  countryCode: string
  pocEmail: string
  allowedEmailDomains: string
}

type TrialDraft = {
  organizationName: string
  organizationCode: string
  countryCode: string
  displayMessage: string
  teamNames: string
  enableTeamNames: boolean
  enableNicknames: boolean
  aiSettings: typeof DEFAULT_AI_DEMO_SETTINGS
  enableAiForJjSquatDemo: boolean
  enableAiForPlankDemo: boolean
  accessDuration: string
}

type PlatformTab = 'defaults' | 'organizations' | 'trials'

const MIN_TRIAL_DURATION_MINUTES = 5
const MAX_TRIAL_DURATION_MINUTES = 24 * 60

function buildAbsoluteUrl(path: string): string {
  return `${window.location.origin}${path}`
}

function parseTrialDuration(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim())
  if (!match) return null

  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes >= MIN_TRIAL_DURATION_MINUTES && minutes <= MAX_TRIAL_DURATION_MINUTES ? minutes : null
}

function formatTrialDuration(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function parseTrialTeamNames(value: string): string[] {
  const seen = new Set<string>()

  return value
    .split(',')
    .map((teamName) => teamName.trim())
    .filter((teamName) => {
      const key = teamName.toLocaleLowerCase()
      if (!teamName || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

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
  const [organizationTrials, setOrganizationTrials] = useState<OrganizationTrialRecord[]>([])
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [generatedTrial, setGeneratedTrial] = useState<OrganizationTrialRecord | null>(null)
  const [organizationDraft, setOrganizationDraft] = useState<OrganizationDraft>({
    name: '',
    organizationCode: '',
    countryCode: '',
    pocEmail: '',
    allowedEmailDomains: '',
  })
  const [trialDraft, setTrialDraft] = useState<TrialDraft>({
    organizationName: '',
    organizationCode: '',
    countryCode: '',
    displayMessage: '',
    teamNames: '',
    enableTeamNames: false,
    enableNicknames: false,
    aiSettings: { ...DEFAULT_AI_DEMO_SETTINGS, enableAILiveCoach: false, enableAIAnnouncer: false, enableExecutiveSummary: false },
    enableAiForJjSquatDemo: true,
    enableAiForPlankDemo: true,
    accessDuration: '00:30',
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
        setOrganizationTrials([])
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
        const [nextSettings, nextOrganizations, nextInvites, nextTrials, nextHistory] = await Promise.all([
          getApplicationSettings(),
          getOrganizations(),
          getOrganizationInvites(),
          getOrganizationTrials(),
          getChallengeHistory(),
        ])
        setApplicationSettings(nextSettings)
        setOrganizations(nextOrganizations)
        setOrganizationInvites(nextInvites)
        setOrganizationTrials(nextTrials)
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
          enable_ai_overlay: draft.enable_ai_overlay,
          enable_ai_live_coach: draft.enable_ai_live_coach,
          enable_ai_announcer: draft.enable_ai_announcer,
          enable_executive_summary: draft.enable_executive_summary,
          enable_celebration_animations: draft.enable_celebration_animations,
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

  async function onCreateOrganizationWithInvite() {
    try {
      setBusy(true)
      setError(null)
      setMessage(null)

      const result = await createOrganizationWithInvite(organizationDraft)
      setGeneratedInviteUrl(`${window.location.origin}${result.inviteUrlPath}`)
      if (isPlatformAdmin) {
        setOrganizations(await getOrganizations())
        setOrganizationInvites(await getOrganizationInvites())
      }
      setMessage('Organization created and POC setup URL generated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create organization and invite.')
    } finally {
      setBusy(false)
    }
  }

  async function onCreateOrganizationTrial() {
    const accessDurationMinutes = parseTrialDuration(trialDraft.accessDuration)
    if (accessDurationMinutes === null) {
      setError('Enter a trial duration from 00:05 through 24:00 in HH:MM format.')
      return
    }

    try {
      setBusy(true)
      setError(null)
      setMessage(null)
      const trial = await createOrganizationTrial({
        organizationName: trialDraft.organizationName,
        organizationCode: trialDraft.organizationCode,
        countryCode: trialDraft.countryCode,
        displayMessage: trialDraft.displayMessage,
        teamNames: trialDraft.enableTeamNames ? parseTrialTeamNames(trialDraft.teamNames) : [],
        enableTeamNames: trialDraft.enableTeamNames,
        enableNicknames: trialDraft.enableNicknames,
        aiSettings: trialDraft.aiSettings,
        enableAiForJjSquatDemo: trialDraft.enableAiForJjSquatDemo,
        enableAiForPlankDemo: trialDraft.enableAiForPlankDemo,
        accessDurationMinutes,
      })
      setGeneratedTrial(trial)
      setOrganizationTrials(await getOrganizationTrials())
      setMessage('Organization trial created. Share the entry code or either trial URL.')
    } catch (err) {
      setError(getAdminErrorMessage(err, 'Unable to create organization trial.'))
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
              <button
                className={`admin-tab ${platformTab === 'trials' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={platformTab === 'trials'}
                onClick={() => setPlatformTab('trials')}
              >
                Organization Trials
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
            ) : platformTab === 'organizations' ? (
              <section className="panel settings-panel">
                <h2>Organizations & Invites</h2>
                <p>Create the organization record and its POC setup URL in one step.</p>

                <div className="admin-management-block admin-management-block-wide">
                  <h3 className="admin-subsection-title">New organization</h3>
                  <div className="stack">
                    <div className="settings-grid admin-organization-grid">
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
                      onClick={() => void onCreateOrganizationWithInvite()}
                      disabled={busy || !organizationDraft.name.trim() || !organizationDraft.organizationCode.trim() || !organizationDraft.countryCode.trim() || !organizationDraft.pocEmail.trim()}
                    >
                      {busy ? 'Creating...' : 'Create Organization & Generate URL'}
                    </button>
                    {generatedInviteUrl ? (
                      <label>
                        Latest POC setup URL
                        <input value={generatedInviteUrl} readOnly />
                      </label>
                    ) : null}
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
                        return <tr key={invite.id}><td>{invite.organization_name} <span className="table-muted">({invite.organization_code})</span></td><td>{invite.poc_email}</td><td>{invite.status}</td><td>{dayjs(invite.expires_at).format('YYYY-MM-DD')}</td><td><a href={url} target="_blank" rel="noreferrer">{url}</a></td></tr>
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
            ) : (
              <section className="panel settings-panel">
                <h2>Organization Trial</h2>
                <p>Create a time-limited demo code. Trial participants can use only squats and jumping jacks; their scores update live until the access window ends.</p>

                <div className="admin-management-block admin-management-block-wide">
                  <h3 className="admin-subsection-title">New trial code</h3>
                  <div className="stack">
                    <div className="settings-grid admin-organization-grid">
                      <label>Organization name<input value={trialDraft.organizationName} onChange={(event) => setTrialDraft((state) => ({ ...state, organizationName: event.target.value }))} placeholder="Citi" /></label>
                      <label>Organization code<input value={trialDraft.organizationCode} onChange={(event) => setTrialDraft((state) => ({ ...state, organizationCode: event.target.value }))} placeholder="CITI2026" /></label>
                      <label>Country code<input value={trialDraft.countryCode} onChange={(event) => setTrialDraft((state) => ({ ...state, countryCode: event.target.value }))} placeholder="sg" /></label>
                      <label>Trial access duration (HH:MM)<input value={trialDraft.accessDuration} onChange={(event) => setTrialDraft((state) => ({ ...state, accessDuration: event.target.value }))} inputMode="numeric" pattern="\\d{1,2}:[0-5]\\d" placeholder="00:30" aria-describedby="trial-duration-hint" /></label>
                    </div>
                    <p className="hint" id="trial-duration-hint">Minimum 00:05. Maximum 24:00.</p>
                    <div className="exercise-toggle-grid">
                      <label className="exercise-toggle-card">
                        <input
                          type="checkbox"
                          checked={trialDraft.enableNicknames}
                          onChange={(event) => setTrialDraft((state) => ({ ...state, enableNicknames: event.target.checked }))}
                        />
                        <span>Enable nicknames</span>
                      </label>
                      <label className="exercise-toggle-card">
                        <input
                          type="checkbox"
                          checked={trialDraft.enableTeamNames}
                          onChange={(event) => setTrialDraft((state) => ({ ...state, enableTeamNames: event.target.checked }))}
                        />
                        <span>Enable teams</span>
                      </label>
                    </div>
                    {trialDraft.enableTeamNames ? (
                      <label>Team names<input value={trialDraft.teamNames} onChange={(event) => setTrialDraft((state) => ({ ...state, teamNames: event.target.value }))} placeholder="Blue Team, Operations, Sales" /></label>
                    ) : null}

                    <AIDemoSettings
                      value={trialDraft.aiSettings}
                      onChange={(aiSettings) => setTrialDraft((state) => ({ ...state, aiSettings }))}
                    />
                    <div>
                      <h3 className="admin-subsection-title">Org demo AI availability</h3>
                      <div className="exercise-toggle-grid">
                        <label className="exercise-toggle-card">
                          <input
                            type="checkbox"
                            checked={trialDraft.enableAiForJjSquatDemo}
                            onChange={(event) => setTrialDraft((state) => ({ ...state, enableAiForJjSquatDemo: event.target.checked }))}
                          />
                          <span>JJ + Squat demo</span>
                        </label>
                        <label className="exercise-toggle-card">
                          <input
                            type="checkbox"
                            checked={trialDraft.enableAiForPlankDemo}
                            onChange={(event) => setTrialDraft((state) => ({ ...state, enableAiForPlankDemo: event.target.checked }))}
                          />
                          <span>Plank demo</span>
                        </label>
                      </div>
                    </div>
                    <label>Organization message<textarea value={trialDraft.displayMessage} onChange={(event) => setTrialDraft((state) => ({ ...state, displayMessage: event.target.value }))} placeholder="Welcome to the FitPerks trial." /></label>
                    <button className="button primary" type="button" onClick={() => void onCreateOrganizationTrial()} disabled={busy || !trialDraft.organizationName.trim() || !trialDraft.organizationCode.trim() || !trialDraft.countryCode.trim()}>
                      {busy ? 'Creating...' : 'Create Trial Code & URLs'}
                    </button>
                    {generatedTrial ? (
                      <div className="trial-url-list">
                        <label>Trial code<input value={generatedTrial.code} readOnly /></label>
                        {[
                          ['Demo entry URL', buildAbsoluteUrl(generatedTrial.entryUrlPath ?? `/demo?code=${generatedTrial.code}`)],
                          ['Quick-start workout URL', buildAbsoluteUrl(generatedTrial.workoutUrlPath)],
                          ...(generatedTrial.enableNicknames || generatedTrial.enableTeamNames
                            ? [['Live scoreboard URL', buildAbsoluteUrl(generatedTrial.scoreboardUrlPath)]]
                            : []),
                        ].map(([label, url]) => (
                          <label key={label}>
                            {label}
                            <div className="trial-url-row">
                              <input value={url} readOnly />
                              <a className="button ghost button-small" href={url} target="_blank" rel="noreferrer">
                                Open
                              </a>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="admin-list-block">
                  <h3 className="admin-subsection-title">Created trials</h3>
                  {organizationTrials.length === 0 ? <p>No trial codes created yet.</p> : (
                    <div className="table-scroll"><table><thead><tr><th>Organization</th><th>Code</th><th>Features</th><th>Duration</th><th>Expires</th><th>Workout URL</th><th>Scoreboard URL</th></tr></thead><tbody>{organizationTrials.map((trial) => {
                      const hasScoreboard = trial.enableNicknames || trial.enableTeamNames
                      const features = [trial.enableNicknames ? 'Nicknames' : null, trial.enableTeamNames ? 'Teams' : null, trial.enableAiOverlay ? 'AI overlay' : null, trial.enableAiLiveCoach ? 'Live coach API' : null].filter(Boolean).join(', ') || 'Demo only'
                      return <tr key={trial.id}><td>{trial.organizationName} <span className="table-muted">({trial.organizationCode})</span></td><td>{trial.code}</td><td>{features}</td><td>{formatTrialDuration(trial.accessDurationMinutes)}</td><td>{dayjs(trial.expiresAt).format('YYYY-MM-DD HH:mm')}</td><td><a href={buildAbsoluteUrl(trial.workoutUrlPath)} target="_blank" rel="noreferrer">Open</a></td><td>{hasScoreboard ? <a href={buildAbsoluteUrl(trial.scoreboardUrlPath)} target="_blank" rel="noreferrer">Open</a> : <span className="table-muted">Off</span>}</td></tr>
                    })}</tbody></table></div>
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


              <AIDemoSettings
                value={{
                  enableAIOverlay: draft.enable_ai_overlay,
                  enableAILiveCoach: draft.enable_ai_live_coach,
                  enableAIAnnouncer: draft.enable_ai_announcer,
                  enableExecutiveSummary: draft.enable_executive_summary,
                  enableCelebrationAnimations: draft.enable_celebration_animations,
                }}
                onChange={(aiSettings) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          enable_ai_overlay: aiSettings.enableAIOverlay,
                          enable_ai_live_coach: aiSettings.enableAILiveCoach,
                          enable_ai_announcer: aiSettings.enableAIAnnouncer,
                          enable_executive_summary: aiSettings.enableExecutiveSummary,
                          enable_celebration_animations: aiSettings.enableCelebrationAnimations,
                        }
                      : current,
                  )
                }
              />

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
