import dayjs from 'dayjs'
import Papa from 'papaparse'
import { DEFAULT_APP_SETTINGS, DEFAULT_CALIBRATION, type AppSettings } from './settings'
import { ensureAnonymousParticipantSession, supabase, useFlowStubs } from './supabase'
import type {
  AdminUserRecord,
  ChallengeRecord,
  ExerciseType,
  GuestChallengeInput,
  GuestChallengeRecord,
  GuestChallengeSummary,
  GuestScoreboardRow,
  InviteSetupContext,
  IndividualLeaderboardRow,
  ParticipantInput,
  ParticipantProfile,
  PublicLaunchContext,
  TeamLeaderboardRow,
} from '../types'

type StubInviteState = {
  token: string
  organizationCode: string
  organizationName: string
  organizationSlug: string
  countryCode: string
  pocEmail: string
  displayMessage: string
  status?: 'pending' | 'accepted' | 'expired'
}

type StubFlowState = {
  invites: StubInviteState[]
  guestChallenges?: GuestChallengeRecord[]
}

const STUB_FLOW_STORAGE_KEY = 'fitperk.flow.stub.state.v1'
const POC_INVITE_TOKEN = 'INNOSETUP2026'
const POC_INVITE: StubInviteState = {
  token: POC_INVITE_TOKEN,
  organizationCode: 'INNOBLAZE2026',
  organizationName: 'InnoBlaze',
  organizationSlug: 'innoblaze',
  countryCode: 'us',
  pocEmail: 'poc@innoblaze.test',
  displayMessage: 'Welcome to the InnoBlaze commute challenge. Complete your reps and climb the leaderboard.',
  status: 'pending',
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleFromCode(organizationCode: string): string {
  const normalized = organizationCode.trim().replace(/\d+/g, '').replace(/[-_]+/g, ' ')
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function readStubFlowState(): StubFlowState {
  const raw = localStorage.getItem(STUB_FLOW_STORAGE_KEY)
  if (!raw) {
    return { invites: [POC_INVITE], guestChallenges: [] }
  }

  try {
    const parsed = JSON.parse(raw) as StubFlowState
    const invites = parsed.invites ?? []
    if (!invites.some((invite) => invite.token === POC_INVITE_TOKEN)) {
      invites.push(POC_INVITE)
    }
    return { invites, guestChallenges: parsed.guestChallenges ?? [] }
  } catch {
    return { invites: [POC_INVITE], guestChallenges: [] }
  }
}

function writeStubFlowState(state: StubFlowState): void {
  localStorage.setItem(STUB_FLOW_STORAGE_KEY, JSON.stringify(state))
}

function buildStubChallenge(organizationCode = 'SAMPLECO2026'): ChallengeRecord {
  return {
    id: `stub-challenge-${organizationCode.toLowerCase()}`,
    organization_id: `stub-org-${organizationCode.toLowerCase()}`,
    name: `${titleFromCode(organizationCode)} Commute Fitness Challenge`,
    description: 'Commuter challenge with jumping jacks to office and squats back home.',
    start_date: dayjs().subtract(1, 'day').toISOString(),
    end_date: dayjs().add(14, 'day').toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    status: 'active',
    squat_points_per_rep: 1,
    burpee_points_per_rep: 2,
    high_knees_points_per_rep: 1,
    lunges_points_per_rep: 2,
    daily_streak_bonus: 0,
    team_streak_bonus: 0,
    max_sessions_per_day: 3,
    enabled_squat: true,
    enabled_burpee: true,
    enabled_high_knees: true,
    enabled_lunges: true,
    qualifying_threshold_type: 'total_points',
    qualifying_threshold_value: 10,
    team_qualification_type: 'fixed_count',
    team_required_unique_members: 3,
    team_required_participation_percent: 25,
    created_at: dayjs().toISOString(),
  }
}

function samplePublicContext(): PublicLaunchContext {
  return {
    organizationId: 'stub-org-sample-company',
    organizationName: 'Sample Company',
    organizationSlug: 'sample-company',
    countryCode: 'us',
    organizationCode: 'SAMPLECO2026',
    displayMessage: 'Welcome to the commute challenge. To office: jumping jacks. Return: squats.',
    setupStatus: 'ready',
    setupUrlPath: null,
  }
}

export async function getOrCreateEventSettings(): Promise<AppSettings> {
  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('*')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (challengeError) {
    throw challengeError
  }

  if (!challenge) {
    return DEFAULT_APP_SETTINGS
  }

  return {
    id: challenge.id,
    sessionDurationSeconds: 60,
      enabledChallenges: {
        squat: Boolean(challenge.enabled_squat),
        burpee: Boolean(challenge.enabled_burpee),
        'high-knees': Boolean(challenge.enabled_high_knees),
        lunges: Boolean(challenge.enabled_lunges),
      },
    calibration: DEFAULT_CALIBRATION,
  }
}

export async function updateEventSettings(settings: AppSettings): Promise<AppSettings> {
  const patch = {
    enabled_squat: settings.enabledChallenges.squat,
    enabled_burpee: settings.enabledChallenges.burpee,
    enabled_high_knees: settings.enabledChallenges['high-knees'],
    enabled_lunges: settings.enabledChallenges.lunges,
  }

  const { error } = await supabase.from('challenges').update(patch).eq('id', settings.id)

  if (error) {
    throw error
  }

  return settings
}

export async function joinOrganizationAndRegister(input: ParticipantInput): Promise<ParticipantProfile> {
  await ensureAnonymousParticipantSession()

  const normalizedOrgCode = input.organizationCode.trim().toUpperCase()

  const { data, error } = await supabase.rpc('participant_join_with_code', {
    p_organization_code: normalizedOrgCode,
    p_nickname: input.name.trim(),
    p_team_name: input.team.trim(),
    p_email: input.email?.trim() || null,
  })

  if (error) {
    throw error
  }

  const profile = data as {
    participant_id: string
    organization_id: string
    organization_name: string
    team_id: string
    team_name: string
    nickname: string
  }

  const activeChallenge = await getActiveChallenge(normalizedOrgCode)

  return {
    id: profile.participant_id,
    organizationId: profile.organization_id,
    organizationName: profile.organization_name,
    organizationCode: normalizedOrgCode,
    challengeId: activeChallenge?.id,
    name: profile.nickname,
    team: profile.team_name,
    teamId: profile.team_id,
    email: input.email,
  }
}

export async function getActiveChallenge(organizationCode?: string): Promise<ChallengeRecord | null> {
  if (useFlowStubs) {
    return buildStubChallenge(organizationCode?.trim().toUpperCase() ?? 'SAMPLECO2026')
  }

  const normalizedOrgCode = organizationCode?.trim().toUpperCase()
  const rpcName = organizationCode ? 'get_active_challenge_by_code' : 'get_active_challenge_for_org'
  const args = normalizedOrgCode ? { p_organization_code: normalizedOrgCode } : {}

  const { data, error } = await supabase.rpc(rpcName, args)

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return data as ChallengeRecord
}

export async function getChallengeHistory(): Promise<ChallengeRecord[]> {
  if (useFlowStubs) {
    return [buildStubChallenge('SAMPLECO2026')]
  }

  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .in('status', ['active', 'completed', 'archived'])
    .order('start_date', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as ChallengeRecord[]
}

export async function submitWorkoutSecure(input: {
  sessionId: string
  exercise: ExerciseType
  reps: number
}): Promise<{ workoutId: string; idempotent: boolean; pointsAdded: number; qualifying: boolean }> {
  const { data, error } = await supabase.rpc('submit_workout_secure', {
    p_session_id: input.sessionId,
    p_exercise: input.exercise,
    p_reps: input.reps,
  })

  if (error) {
    throw error
  }

  const result = data as {
    workout_id: string
    idempotent: boolean
    points_added: number
    qualifying: boolean
  }

  return {
    workoutId: result.workout_id,
    idempotent: result.idempotent,
    pointsAdded: result.points_added,
    qualifying: result.qualifying,
  }
}

export async function getIndividualLeaderboard(
  challengeId: string,
  period: 'today' | 'overall',
): Promise<IndividualLeaderboardRow[]> {
  if (useFlowStubs) {
    const multiplier = period === 'today' ? 1 : 2
    return [
      {
        participantId: `${challengeId}-p1`,
        participantName: 'ANISH',
        teamName: 'Ops',
        totalSquats: 20 * multiplier,
        totalBurpees: 10 * multiplier,
        totalHighKnees: 25 * multiplier,
        totalLunges: 12 * multiplier,
        score: 40 * multiplier,
      },
      {
        participantId: `${challengeId}-p2`,
        participantName: 'MAYA',
        teamName: 'Sales',
        totalSquats: 15 * multiplier,
        totalBurpees: 8 * multiplier,
        totalHighKnees: 18 * multiplier,
        totalLunges: 10 * multiplier,
        score: 31 * multiplier,
      },
    ]
  }

  const { data, error } = await supabase.rpc('get_individual_leaderboard', {
    p_challenge_id: challengeId,
    p_period: period,
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as any[]).map((row) => ({
    participantId: row.participant_id,
    participantName: row.participant_name,
    teamName: row.team_name,
    totalSquats: row.total_squats,
    totalBurpees: row.total_burpees,
    totalHighKnees: row.total_high_knees,
    totalLunges: row.total_lunges,
    score: row.score,
  }))
}

export async function getTeamLeaderboard(
  challengeId: string,
  period: 'today' | 'overall',
): Promise<TeamLeaderboardRow[]> {
  if (useFlowStubs) {
    const multiplier = period === 'today' ? 1 : 2
    return [
      {
        rank: 1,
        teamId: `${challengeId}-t1`,
        teamName: 'Ops',
        workoutPoints: 46 * multiplier,
        teamStreakBonus: 14 * multiplier,
        totalTeamPoints: 60 * multiplier,
        uniqueParticipants: 4,
        currentStreak: 3,
        participationPercentage: 72,
      },
      {
        rank: 2,
        teamId: `${challengeId}-t2`,
        teamName: 'Sales',
        workoutPoints: 32 * multiplier,
        teamStreakBonus: 8 * multiplier,
        totalTeamPoints: 40 * multiplier,
        uniqueParticipants: 3,
        currentStreak: 2,
        participationPercentage: 61,
      },
    ]
  }

  const { data, error } = await supabase.rpc('get_team_leaderboard', {
    p_challenge_id: challengeId,
    p_period: period,
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as any[]).map((row) => ({
    rank: row.rank,
    teamId: row.team_id,
    teamName: row.team_name,
    workoutPoints: row.workout_points,
    teamStreakBonus: row.team_streak_bonus,
    totalTeamPoints: row.total_team_points,
    uniqueParticipants: row.unique_participants,
    currentStreak: row.current_streak,
    participationPercentage: Number(row.participation_percentage ?? 0),
  }))
}

export async function getCurrentAdminUser(): Promise<AdminUserRecord | null> {
  if (useFlowStubs) {
    return {
      id: 'stub-admin',
      organization_id: null,
      user_id: 'stub-user',
      role: 'platform_admin',
      created_at: dayjs().toISOString(),
    }
  }

  const { data, error } = await supabase.from('admin_users').select('*').limit(1).maybeSingle()

  if (error) {
    throw error
  }

  return data as AdminUserRecord | null
}

export async function createOrganizationInvite(input: {
  organizationCode: string
  pocEmail: string
  countryCode: string
}): Promise<{ token: string; inviteUrlPath: string }> {
  if (useFlowStubs) {
    const token = `stub-${crypto.randomUUID().slice(0, 12)}`
    const organizationCode = input.organizationCode.trim().toUpperCase()
    const organizationName = titleFromCode(organizationCode) || 'Sample Company'
    const organizationSlug = slugify(organizationName) || 'sample-company'

    const state = readStubFlowState()
    state.invites.push({
      token,
      organizationCode,
      organizationName,
      organizationSlug,
      countryCode: input.countryCode.trim().toLowerCase() || 'us',
      pocEmail: input.pocEmail.trim().toLowerCase(),
      displayMessage: 'Welcome to the challenge. Complete your commute reps and climb the leaderboard.',
      status: 'pending',
    })
    writeStubFlowState(state)

    return {
      token,
      inviteUrlPath: `/setup/${token}`,
    }
  }

  const { data, error } = await supabase.rpc('create_organization_invite', {
    p_organization_code: input.organizationCode.trim(),
    p_poc_email: input.pocEmail.trim().toLowerCase(),
    p_country_code: input.countryCode.trim().toLowerCase(),
  })

  if (error) {
    throw error
  }

  const payload = data as { token: string; invite_url_path: string }
  return {
    token: payload.token,
    inviteUrlPath: payload.invite_url_path,
  }
}

export async function getInviteSetupContext(token: string): Promise<InviteSetupContext> {
  if (useFlowStubs) {
    const state = readStubFlowState()
    const invite = state.invites.find((item) => item.token === token)
    if (!invite) {
      throw new Error('Invite token is invalid in stub mode.')
    }

    return {
      token: invite.token,
      organizationId: `stub-org-${invite.organizationSlug}`,
      organizationName: invite.organizationName,
      organizationSlug: invite.organizationSlug,
      organizationCode: invite.organizationCode,
      countryCode: invite.countryCode,
      pocEmail: invite.pocEmail,
      existingChallengeId: null,
      existingChallengeName: null,
    }
  }

  const { data, error } = await supabase.rpc('get_invite_setup_context', {
    p_token: token,
  })

  if (error) {
    throw error
  }

  const payload = data as {
    token: string
    organization_id: string
    organization_name: string
    organization_slug: string
    organization_code: string
    country_code: string
    poc_email: string
    existing_challenge_id: string | null
    existing_challenge_name: string | null
  }

  return {
    token: payload.token,
    organizationId: payload.organization_id,
    organizationName: payload.organization_name,
    organizationSlug: payload.organization_slug,
    organizationCode: payload.organization_code,
    countryCode: payload.country_code,
    pocEmail: payload.poc_email,
    existingChallengeId: payload.existing_challenge_id,
    existingChallengeName: payload.existing_challenge_name,
  }
}

export async function completeInviteSetup(input: {
  token: string
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
}): Promise<{ launchUrlPath: string }> {
  if (useFlowStubs) {
    const state = readStubFlowState()
    const index = state.invites.findIndex((item) => item.token === input.token)
    if (index === -1) {
      throw new Error('Invite token is invalid in stub mode.')
    }

    const invite = state.invites[index]
    const organizationName = input.organizationName.trim() || invite.organizationName
    const organizationSlug = slugify(organizationName) || invite.organizationSlug
    const countryCode = input.countryCode.trim().toLowerCase() || invite.countryCode

    state.invites[index] = {
      ...invite,
      organizationName,
      organizationSlug,
      countryCode,
      displayMessage:
        input.displayMessage.trim() || 'Welcome to the challenge. Complete your commute reps and climb the leaderboard.',
      status: 'accepted',
    }

    writeStubFlowState(state)

    return { launchUrlPath: `/launch/${countryCode}/${organizationSlug}` }
  }

  const { data, error } = await supabase.rpc('complete_invite_setup', {
    p_token: input.token,
    p_organization_name: input.organizationName.trim(),
    p_country_code: input.countryCode.trim().toLowerCase(),
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_enabled_squat: input.enabledSquat,
    p_enabled_burpee: input.enabledBurpee,
    p_display_message: input.displayMessage.trim() || null,
    p_enabled_high_knees: input.enabledHighKnees,
    p_enabled_lunges: input.enabledLunges,
    p_timezone: input.timezone.trim() || 'UTC',
  })

  if (error) {
    throw error
  }

  const payload = data as { launch_url_path: string }
  return { launchUrlPath: payload.launch_url_path }
}

export async function getPublicLaunchContext(input: {
  countryCode: string
  organizationSlug: string
}): Promise<PublicLaunchContext> {
  if (useFlowStubs) {
    const countryCode = input.countryCode.trim().toLowerCase()
    const organizationSlug = input.organizationSlug.trim().toLowerCase()
    const state = readStubFlowState()

    const invite = state.invites.find(
      (item) => item.countryCode === countryCode && item.organizationSlug === organizationSlug,
    )

    if (invite) {
      return {
        organizationId: `stub-org-${invite.organizationSlug}`,
        organizationName: invite.organizationName,
        organizationSlug: invite.organizationSlug,
        countryCode: invite.countryCode,
        organizationCode: invite.organizationCode,
        displayMessage: invite.displayMessage,
        setupStatus: invite.status === 'accepted' ? 'ready' : 'pending',
        setupUrlPath: invite.status === 'accepted' ? null : `/setup/${invite.token}`,
      }
    }

    if (countryCode === 'us' && organizationSlug === 'sample-company') {
      return samplePublicContext()
    }

    if (countryCode === 'us' && organizationSlug === 'company-a') {
      return {
        organizationId: 'stub-org-company-a',
        organizationName: 'Company A',
        organizationSlug: 'company-a',
        countryCode: 'us',
        organizationCode: 'COMPANYA2026',
        displayMessage: 'Welcome to Company A Challenge Week',
        setupStatus: 'ready',
        setupUrlPath: null,
      }
    }

    throw new Error('Organization launch page not found in stub mode.')
  }

  const { data, error } = await supabase.rpc('get_public_launch_context', {
    p_country_code: input.countryCode.trim().toLowerCase(),
    p_organization_slug: input.organizationSlug.trim().toLowerCase(),
  })

  if (error) {
    throw error
  }

  const payload = data as {
    organization_id: string
    organization_name: string
    organization_slug: string
    country_code: string
    organization_code: string
    display_message: string | null
    setup_status: 'pending' | 'ready' | null
    setup_url_path: string | null
  }

  return {
    organizationId: payload.organization_id,
    organizationName: payload.organization_name,
    organizationSlug: payload.organization_slug,
    countryCode: payload.country_code,
    organizationCode: payload.organization_code,
    displayMessage: payload.display_message,
    setupStatus: payload.setup_status ?? 'ready',
    setupUrlPath: payload.setup_url_path,
  }
}

export async function updateChallengeConfig(input: {
  challengeId: string
  patch: Partial<ChallengeRecord>
}): Promise<void> {
  if (useFlowStubs) {
    return
  }

  const { data: previous, error: prevError } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', input.challengeId)
    .single()

  if (prevError) {
    throw prevError
  }

  const { error } = await supabase.from('challenges').update(input.patch).eq('id', input.challengeId)

  if (error) {
    throw error
  }

  await supabase.rpc('write_audit_log', {
    p_organization_id: previous.organization_id,
    p_action: 'challenge_config_update',
    p_entity_type: 'challenge',
    p_entity_id: input.challengeId,
    p_previous_value: previous,
    p_new_value: { ...previous, ...input.patch },
  })
}

function mapGuestChallenge(payload: {
  id: string
  code: string
  title: string
  creator_name: string
  creator_email: string
  duration_days: number
  attempts_per_day: number
  max_players: number
  selected_exercises: ExerciseType[]
  session_duration_seconds: number
  start_date: string
  end_date: string
  purge_after: string
  created_at: string
}): GuestChallengeRecord {
  return {
    id: payload.id,
    code: payload.code,
    title: payload.title,
    creatorName: payload.creator_name,
    creatorEmail: payload.creator_email,
    durationDays: payload.duration_days,
    attemptsPerDay: payload.attempts_per_day,
    maxPlayers: payload.max_players,
    selectedExercises: payload.selected_exercises ?? ['squat', 'burpee', 'high-knees', 'lunges'],
    sessionDurationSeconds: payload.session_duration_seconds ?? 60,
    startDate: payload.start_date,
    endDate: payload.end_date,
    purgeAfter: payload.purge_after,
    createdAt: payload.created_at,
  }
}

export async function createGuestChallenge(input: GuestChallengeInput): Promise<GuestChallengeRecord> {
  if (useFlowStubs) {
    const state = readStubFlowState()
    const active = state.guestChallenges?.find((challenge) =>
      dayjs(challenge.endDate).isAfter(dayjs()) && challenge.creatorEmail === input.creatorEmail.trim().toLowerCase(),
    )
    if (active) {
      throw new Error('You already have an active guest challenge. Share that one until it ends.')
    }

    const durationDays = Math.min(7, Math.max(1, input.durationDays))
    const attemptsPerDay = Math.min(5, Math.max(1, input.attemptsPerDay))
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toLowerCase()
    const start = dayjs(input.startDate).isValid() ? dayjs(input.startDate) : dayjs()
    const now = start
    const challenge: GuestChallengeRecord = {
      id: `stub-guest-${code}`,
      code,
      title: input.title.trim() || 'FitPerks Challenge',
      creatorName: input.creatorName.trim() || 'Host',
      creatorEmail: input.creatorEmail.trim().toLowerCase(),
      durationDays,
      attemptsPerDay,
      maxPlayers: 10,
      selectedExercises: input.selectedExercises,
      sessionDurationSeconds: input.sessionDurationSeconds,
      startDate: now.toISOString(),
      endDate: now.add(durationDays, 'day').toISOString(),
      purgeAfter: now.add(durationDays + 3, 'day').toISOString(),
      createdAt: now.toISOString(),
    }

    state.guestChallenges = [challenge, ...(state.guestChallenges ?? [])]
    writeStubFlowState(state)
    return challenge
  }

  const { data, error } = await supabase.rpc('create_guest_challenge', {
    p_creator_key: input.creatorKey,
    p_creator_name: input.creatorName.trim(),
    p_creator_email: input.creatorEmail.trim().toLowerCase(),
    p_title: input.title.trim(),
    p_duration_days: input.durationDays,
    p_attempts_per_day: input.attemptsPerDay,
    p_start_date: input.startDate,
    p_selected_exercises: input.selectedExercises,
    p_session_duration_seconds: input.sessionDurationSeconds,
  })

  if (error) {
    throw error
  }

  return mapGuestChallenge(data as Parameters<typeof mapGuestChallenge>[0])
}

export async function getGuestChallengesForEmail(email: string): Promise<GuestChallengeSummary[]> {
  if (useFlowStubs) {
    const state = readStubFlowState()
    return (state.guestChallenges ?? [])
      .filter((challenge) => dayjs(challenge.endDate).isAfter(dayjs()))
      .map((challenge) => ({ ...challenge, playerCount: 0, joined: challenge.creatorEmail === email.trim().toLowerCase() }))
  }

  const { data, error } = await supabase.rpc('get_guest_challenges_for_email', {
    p_email: email.trim().toLowerCase(),
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as any[]).map((row) => ({
    ...mapGuestChallenge(row),
    playerCount: Number(row.player_count),
    joined: Boolean(row.joined),
  }))
}

export async function getGuestChallenge(code: string): Promise<GuestChallengeRecord> {
  if (useFlowStubs) {
    const state = readStubFlowState()
    const challenge = state.guestChallenges?.find((item) => item.code === code)
    if (!challenge) {
      throw new Error('Guest challenge not found.')
    }
    return challenge
  }

  const { data, error } = await supabase.rpc('get_guest_challenge', {
    p_code: code.trim().toLowerCase(),
  })

  if (error) {
    throw error
  }

  return mapGuestChallenge(data as Parameters<typeof mapGuestChallenge>[0])
}

export async function getGuestChallengeForCreator(creatorKey: string, creatorEmail: string): Promise<GuestChallengeRecord> {
  if (useFlowStubs) {
    const state = readStubFlowState()
    const challenge = state.guestChallenges?.find((item) =>
      dayjs(item.endDate).isAfter(dayjs()) && item.creatorEmail === creatorEmail.trim().toLowerCase(),
    )
    if (!challenge) {
      throw new Error('Active guest challenge not found.')
    }
    return challenge
  }

  const { data, error } = await supabase.rpc('get_guest_challenge_for_creator', {
    p_creator_key: creatorKey,
    p_creator_email: creatorEmail.trim().toLowerCase(),
  })

  if (error) {
    throw error
  }

  return mapGuestChallenge(data as Parameters<typeof mapGuestChallenge>[0])
}

export async function getGuestScoreboard(code: string): Promise<GuestScoreboardRow[]> {
  if (useFlowStubs) {
    return []
  }

  const { data, error } = await supabase.rpc('get_guest_scoreboard', {
    p_code: code.trim().toLowerCase(),
  })

  if (error) {
    throw error
  }

  return ((data ?? []) as any[]).map((row) => ({
    rank: Number(row.rank),
    guestName: row.guest_name,
    dailyBestScore: row.daily_best_score,
    overallScore: row.overall_score,
    attemptsToday: row.attempts_today,
    exerciseScores: {
      squat: Number(row.squat_score ?? 0),
      burpee: Number(row.burpee_score ?? 0),
      'high-knees': Number(row.high_knees_score ?? 0),
      lunges: Number(row.lunges_score ?? 0),
    },
  }))
}

export async function submitGuestAttempt(input: {
  code: string
  guestName: string
  guestEmail: string
  sessionId: string
  exercise: ExerciseType
  reps: number
}): Promise<{ attemptId: string; playerId: string; score: number }> {
  const { data, error } = await supabase.rpc('submit_guest_attempt', {
    p_code: input.code.trim().toLowerCase(),
    p_guest_name: input.guestName.trim(),
    p_guest_email: input.guestEmail.trim().toLowerCase(),
    p_session_id: input.sessionId,
    p_exercise: input.exercise,
    p_reps: input.reps,
  })

  if (error) {
    throw error
  }

  const payload = data as { attempt_id: string; player_id: string; score: number }
  return {
    attemptId: payload.attempt_id,
    playerId: payload.player_id,
    score: payload.score,
  }
}

export function toCsv(rows: IndividualLeaderboardRow[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      participant: row.participantName,
      team: row.teamName,
      total_squats: row.totalSquats,
      total_burpees: row.totalBurpees,
      total_high_knees: row.totalHighKnees,
      total_lunges: row.totalLunges,
      score: row.score,
    })),
  )
}

export function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function summarizeDailyPoints(rows: IndividualLeaderboardRow[]): number {
  return rows.reduce((sum, row) => sum + row.score, 0)
}

export function nowSessionId(): string {
  return crypto.randomUUID()
}

export function todayFileStamp(): string {
  return dayjs().format('YYYY-MM-DD_HH-mm')
}
