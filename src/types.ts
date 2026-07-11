export type ExerciseType = 'squat' | 'burpee' | 'high-knees' | 'lunges'

export type ParticipantProfile = {
  id: string
  organizationId: string
  organizationName: string
  organizationCode: string
  challengeId?: string
  name: string
  team: string
  teamId?: string
  email?: string
}

export type ParticipantInput = {
  organizationCode: string
  name: string
  team: string
  email?: string
}

export type OrganizationRecord = {
  id: string
  name: string
  slug: string
  organization_code: string
  allowed_email_domains: string[]
  status: 'active' | 'suspended'
  created_at: string
}

export type TeamRecord = {
  id: string
  organization_id: string
  name: string
  created_at?: string
}

export type ParticipantRecord = {
  id: string
  organization_id: string
  team_id: string
  nickname: string
  display_alias: string | null
  email: string | null
  created_at: string
}

export type WorkoutRecord = {
  id: string
  organization_id: string
  challenge_id: string
  participant_id: string
  team_id: string
  session_id?: string
  exercise: ExerciseType
  reps: number
  qualifying?: boolean
  created_at: string
}

export type ChallengeRecord = {
  id: string
  organization_id: string
  name: string
  description: string
  start_date: string
  end_date: string
  timezone: string
  status: 'upcoming' | 'active' | 'completed' | 'archived'
  squat_points_per_rep: number
  burpee_points_per_rep: number
  high_knees_points_per_rep: number
  lunges_points_per_rep: number
  daily_streak_bonus: number
  team_streak_bonus: number
  max_sessions_per_day: number
  enabled_squat: boolean
  enabled_burpee: boolean
  enabled_high_knees: boolean
  enabled_lunges: boolean
  qualifying_threshold_type: 'squats' | 'burpees' | 'high_knees' | 'lunges' | 'total_points'
  qualifying_threshold_value: number
  team_qualification_type: 'fixed_count' | 'percentage'
  team_required_unique_members: number
  team_required_participation_percent: number
  created_at: string
}

export type WorkoutWithParticipant = WorkoutRecord & {
  participantName: string
  participantTeam: string
}

export type TeamLeaderboardRow = {
  rank: number
  teamId?: string
  teamName: string
  workoutPoints: number
  teamStreakBonus: number
  totalTeamPoints: number
  uniqueParticipants: number
  currentStreak: number
  participationPercentage: number
}

export type IndividualLeaderboardRow = {
  participantId: string
  participantName: string
  teamName: string
  totalSquats: number
  totalBurpees: number
  totalHighKnees: number
  totalLunges: number
  score: number
}

export type ChallengeConfig = {
  id: ExerciseType
  name: string
  pointsPerRep: number
  description: string
}

export type EventSettingsRow = {
  id: string
  session_duration_seconds: number
  squat_enabled: boolean
  burpee_enabled: boolean
  high_knees_enabled: boolean
  lunges_enabled: boolean
  calibration: unknown
  updated_at: string
}

export type AdminAuthRole = 'organization_admin' | 'platform_admin'

export type AdminUserRecord = {
  id: string
  organization_id: string | null
  user_id: string
  role: AdminAuthRole
  created_at: string
}

export type OrganizationInvite = {
  token: string
  organizationCode: string
  pocEmail: string
  countryCode: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
}

export type InviteSetupContext = {
  token: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  organizationCode: string
  countryCode: string
  pocEmail: string
  existingChallengeId: string | null
  existingChallengeName: string | null
}

export type PublicLaunchContext = {
  organizationId: string
  organizationName: string
  organizationSlug: string
  countryCode: string
  organizationCode: string
  displayMessage: string | null
  setupStatus: 'pending' | 'ready'
  setupUrlPath: string | null
}

export type GuestChallengeRecord = {
  id: string
  code: string
  title: string
  creatorName: string
  creatorEmail: string
  durationDays: number
  attemptsPerDay: number
  maxPlayers: number
  selectedExercises: ExerciseType[]
  sessionDurationSeconds: number
  startDate: string
  endDate: string
  purgeAfter: string
  createdAt: string
}

export type GuestScoreboardRow = {
  rank: number
  guestName: string
  dailyBestScore: number
  overallScore: number
  attemptsToday: number
}

export type GuestChallengeInput = {
  creatorKey: string
  creatorName: string
  creatorEmail: string
  title: string
  durationDays: number
  attemptsPerDay: number
  startDate: string
  selectedExercises: ExerciseType[]
  sessionDurationSeconds: number
}

export type GuestChallengeSummary = GuestChallengeRecord & {
  playerCount: number
  joined: boolean
}
