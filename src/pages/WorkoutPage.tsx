import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AILivePanel } from '../components/AILivePanel'
import { useEventSettings } from '../hooks/useEventSettings'
import { CHALLENGES, CHALLENGE_VIDEO_PATH } from '../lib/constants'
import { generateLiveCoachSentence } from '../services/AIService'
import { analyzeMovementQuality, type MovementQuality, type RepHistoryEntry } from '../services/MovementAnalysisService'
import { buildLiveCoachPayload } from '../services/PromptService'
import { analyzePose } from '../lib/poseUtils'
import {
  getActiveChallenge,
  getGuestChallenge,
  getOrganizationTrial,
  getOrganizationTrialScoreSummary,
  joinOrganizationAndRegister,
  nowSessionId,
  submitGuestAttempt,
  submitSoloAttempt,
  submitOrganizationTrialResult,
  submitWorkoutSecure,
} from '../lib/supabaseApi'
import { hasSupabaseConfig } from '../lib/supabase'
import { clearParticipantProfile, getConfiguredOrganizationCode, getLastGuestChallengeCode, getLastGuestEmail, getLastGuestName, saveGuestJoinContext, saveParticipantProfile } from '../lib/storage'
import { DEFAULT_AI_DEMO_SETTINGS, type AIDemoSettings, type ChallengeConfig, type ChallengeRecord, type ExerciseType, type GuestChallengeRecord, type OrganizationTrialRecord } from '../types'

type NormalizedLandmark = {
  x: number
  y: number
  z: number
  visibility?: number
}

type PoseResults = {
  image: CanvasImageSource
  poseLandmarks?: NormalizedLandmark[]
}

type PoseInstance = {
  setOptions: (options: Record<string, unknown>) => void
  onResults: (callback: (results: PoseResults) => void) => void
  send: (input: { image: HTMLVideoElement }) => Promise<void>
  close: () => void
}

type CameraInstance = {
  start: () => Promise<void>
  stop: () => void
}

type CameraConstructor = new (
  video: HTMLVideoElement,
  config: {
    onFrame: () => Promise<void>
    width: number
    height: number
  },
) => CameraInstance

type PoseConstructor = new (config: { locateFile: (file: string) => string }) => PoseInstance

type DrawConnectorFn = (
  context: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: unknown,
  options: Record<string, unknown>,
) => void

type DrawLandmarksFn = (
  context: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  options: Record<string, unknown>,
) => void

type SquatStage = 'standing' | 'down'

type JumpingJackStage = 'closed' | 'open'

type HighKneeStage = 'lowered' | 'raised'

type PaceFeedback = {
  id: number
  tone: 'fast' | 'slow'
  label: string
}

const TRIAL_COMPLETION_MESSAGES = [
  'Strong finish. Keep the momentum going.',
  'Great work. Every rep counts.',
  'Nicely done. You stayed focused throughout.',
  'Solid effort. Keep building from here.',
  'Excellent focus through both rounds.',
  'Well completed. That was a disciplined effort.',
  'Strong execution from start to finish.',
  'Great finish. Your consistency showed.',
  'Well done. You carried the effort through.',
  'Excellent work. The full demo is complete.',
  'A clean finish and a strong contribution.',
  'Great effort across both movements.',
  'Well paced, well finished.',
  'Strong session. Your score is earned.',
  'Excellent commitment through the final round.',
  'Well done staying with the sequence.',
  'Great work completing the full challenge.',
  'A focused finish makes the effort count.',
  'Strong result. Thank you for showing up.',
  'Excellent energy through the full demo.',
  'Well completed. Every rep added value.',
  'Great finish under the clock.',
  'Strong work. That is a complete session.',
  'Excellent job closing out both rounds.',
  'Well done. Your effort came through clearly.',
  'Great composure through the final seconds.',
]

type TrialDemoStage = 'jumping-jacks' | 'transition' | 'squats' | 'plank' | 'complete'
type TrialExerciseMode = ExerciseType | 'plank'

const PLANK_CHALLENGE: Omit<ChallengeConfig, 'id'> & { id: 'plank' } = {
  id: 'plank',
  name: 'Plank Challenge',
  pointsPerRep: 1,
  description: 'Hold a straight plank. The timer advances only while your posture is valid.',
}

function getErrorMessage(error: unknown, fallback: string): string {
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

function getPointsPerRep(challenge: ChallengeRecord, exercise: ExerciseType): number {
  if (exercise === 'squat') {
    return challenge.squat_points_per_rep
  }

  if (exercise === 'burpee') {
    return challenge.burpee_points_per_rep
  }

  if (exercise === 'high-knees') {
    return challenge.high_knees_points_per_rep
  }

  return challenge.lunges_points_per_rep
}

function isExerciseEnabled(challenge: ChallengeRecord, exercise: ExerciseType): boolean {
  if (exercise === 'squat') {
    return challenge.enabled_squat
  }

  if (exercise === 'burpee') {
    return challenge.enabled_burpee
  }

  if (exercise === 'high-knees') {
    return challenge.enabled_high_knees
  }

  return challenge.enabled_lunges
}

function getCameraErrorHint(err: unknown): string {
  const raw = err instanceof Error ? `${err.name} ${err.message}`.toLowerCase() : String(err).toLowerCase()

  if (raw.includes('notallowederror') || raw.includes('permission') || raw.includes('denied')) {
    return 'Camera permission is blocked. Allow camera access for this site, then tap Retry Camera.'
  }

  if (raw.includes('notfounderror') || raw.includes('overconstrainederror') || raw.includes('no camera')) {
    return 'No compatible camera was found. Connect/enable a camera and tap Retry Camera.'
  }

  if (raw.includes('notreadableerror') || raw.includes('trackstarterror') || raw.includes('in use')) {
    return 'Camera is busy in another app or tab. Close other camera apps and tap Retry Camera.'
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    const isLocalHost = host === 'localhost' || host === '127.0.0.1'
    if (window.location.protocol !== 'https:' && !isLocalHost) {
      return 'Camera access requires HTTPS on non-localhost sites. Open over HTTPS and tap Retry Camera.'
    }
  }

  return 'Unable to access camera. Check browser camera permission/device settings and tap Retry Camera.'
}

function getPositioningMessage(landmarks: NormalizedLandmark[]): string | null {
  const requiredLandmarks = [11, 12, 23, 24, 27, 28]
  const hasReliableLandmarks = requiredLandmarks.every((index) => (landmarks[index]?.visibility ?? 1) >= 0.45)

  if (!hasReliableLandmarks) {
    return 'Step back so your full body is visible'
  }

  const shoulderCenterX = (landmarks[11].x + landmarks[12].x) / 2
  const hipCenterX = (landmarks[23].x + landmarks[24].x) / 2
  const screenCenterX = 1 - (shoulderCenterX + hipCenterX) / 2
  const bodyHeight = Math.max(landmarks[27].y, landmarks[28].y) - Math.min(landmarks[11].y, landmarks[12].y)

  if (bodyHeight > 0.86) {
    return 'Step back'
  }

  if (bodyHeight < 0.4) {
    return 'Move closer'
  }

  if (screenCenterX < 0.43) {
    return 'Move right'
  }

  if (screenCenterX > 0.57) {
    return 'Move left'
  }

  return null
}

function drawExerciseGuides(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[] | undefined,
  exercise: ExerciseType,
) {
  const color = exercise === 'high-knees' ? '#facc15' : '#38bdf8'

  if (!landmarks) {
    const centerX = width / 2
    const headY = height * 0.2
    const shoulderY = height * 0.34
    const hipY = height * 0.52
    const kneeY = height * 0.7
    const ankleY = height * 0.88
    const shoulderHalfWidth = Math.min(width * 0.1, height * 0.08)
    const hipHalfWidth = shoulderHalfWidth * 0.58
    const footHalfWidth = shoulderHalfWidth * 0.72

    context.save()
    context.strokeStyle = color
    context.fillStyle = color
    context.lineWidth = Math.max(3, width * 0.005)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalAlpha = 0.68
    context.shadowColor = color
    context.shadowBlur = 18
    context.setLineDash([12, 9])

    context.beginPath()
    context.arc(centerX, headY, Math.min(width * 0.045, height * 0.055), 0, Math.PI * 2)
    context.stroke()

    const drawLine = (fromX: number, fromY: number, toX: number, toY: number) => {
      context.moveTo(fromX, fromY)
      context.lineTo(toX, toY)
    }

    context.beginPath()
    drawLine(centerX - shoulderHalfWidth, shoulderY, centerX + shoulderHalfWidth, shoulderY)
    drawLine(centerX, shoulderY, centerX, hipY)
    drawLine(centerX - hipHalfWidth, hipY, centerX + hipHalfWidth, hipY)
    drawLine(centerX - shoulderHalfWidth, shoulderY, centerX - shoulderHalfWidth * 1.18, hipY - height * 0.01)
    drawLine(centerX + shoulderHalfWidth, shoulderY, centerX + shoulderHalfWidth * 1.18, hipY - height * 0.01)
    drawLine(centerX - hipHalfWidth, hipY, centerX - shoulderHalfWidth * 0.66, kneeY)
    drawLine(centerX + hipHalfWidth, hipY, centerX + shoulderHalfWidth * 0.66, kneeY)
    drawLine(centerX - shoulderHalfWidth * 0.66, kneeY, centerX - shoulderHalfWidth * 0.72, ankleY)
    drawLine(centerX + shoulderHalfWidth * 0.66, kneeY, centerX + shoulderHalfWidth * 0.72, ankleY)
    drawLine(centerX - shoulderHalfWidth * 0.72, ankleY, centerX - shoulderHalfWidth * 0.72 - footHalfWidth, ankleY)
    drawLine(centerX + shoulderHalfWidth * 0.72, ankleY, centerX + shoulderHalfWidth * 0.72 + footHalfWidth, ankleY)
    context.stroke()

    context.globalAlpha = 0.28
    context.setLineDash([])
    context.beginPath()
    context.ellipse(centerX, height * 0.92, shoulderHalfWidth * 1.8, height * 0.025, 0, 0, Math.PI * 2)
    context.stroke()
    context.restore()
    return
  }

  // The live pose landmarks provide a more useful guide than the old full-width line.
}

export function WorkoutPage() {
  const { challengeCode = '', trialCode = '', exercise: exerciseParam } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const isSoloWorkout = location.pathname.startsWith('/solo/workout/')
  const isGuestWorkout = Boolean(challengeCode)
  const isTrialWorkout = Boolean(trialCode)
  const shouldAutoEnableCamera = isTrialWorkout
  const configuredOrgCode = getConfiguredOrganizationCode()
  const { settings, loading: settingsLoading } = useEventSettings()
  const exercise = (exerciseParam ?? '') as ExerciseType
  const initialTrialStage: TrialDemoStage = exerciseParam === 'plank' ? 'plank' : 'jumping-jacks'
  const [trialDemoStage, setTrialDemoStage] = useState<TrialDemoStage>(initialTrialStage)
  const trialExercise: TrialExerciseMode = exerciseParam === 'plank' ? 'plank' : trialDemoStage === 'squats' || trialDemoStage === 'transition' || trialDemoStage === 'complete' ? 'squat' : 'burpee'
  const activeExercise: TrialExerciseMode = isTrialWorkout ? trialExercise : exercise
  const challenge = activeExercise === 'plank' ? PLANK_CHALLENGE : CHALLENGES.find((item) => item.id === activeExercise)
  const [activeChallenge, setActiveChallenge] = useState<ChallengeRecord | null>(null)
  const [guestChallenge, setGuestChallenge] = useState<GuestChallengeRecord | null>(null)
  const [organizationTrial, setOrganizationTrial] = useState<OrganizationTrialRecord | null>(null)
  const [sessionId, setSessionId] = useState(nowSessionId())
  const [trialBestScore, setTrialBestScore] = useState<number | null>(null)
  const [trialBestTeamScore, setTrialBestTeamScore] = useState<number | null>(null)
  const [trialCompletionMessage, setTrialCompletionMessage] = useState('')
  const [trialTransitionSecondsLeft, setTrialTransitionSecondsLeft] = useState(15)
  const [trialJumpingJackReps, setTrialJumpingJackReps] = useState(0)
  const [trialJumpingJackScore, setTrialJumpingJackScore] = useState(0)
  const [trialSquatReps, setTrialSquatReps] = useState(0)
  const [trialSquatScore, setTrialSquatScore] = useState(0)
  const [isPlankPostureValid, setIsPlankPostureValid] = useState(false)
  const [movementQuality, setMovementQuality] = useState<MovementQuality | null>(null)
  const [liveCoachMessage, setLiveCoachMessage] = useState<string | null>(null)
  const [liveCoachError, setLiveCoachError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const poseRef = useRef<PoseInstance | null>(null)
  const cameraRef = useRef<CameraInstance | null>(null)
  const handleRepDetectionRef = useRef<(landmarks: NormalizedLandmark[]) => void>(() => undefined)
  const challengeRef = useRef<typeof challenge>(challenge)

  const squatStageRef = useRef<SquatStage>('standing')
  const lungeStageRef = useRef<SquatStage>('standing')
  const lungeDepthFramesRef = useRef(0)
  const lungeStandingFramesRef = useRef(0)
  const lastLungeRepAtRef = useRef(0)
  const jumpingJackStageRef = useRef<JumpingJackStage>('closed')
  const jumpingJackOpenFramesRef = useRef(0)
  const jumpingJackClosedFramesRef = useRef(0)
  const lastJumpingJackRepAtRef = useRef(0)
  const highKneeStageRef = useRef<HighKneeStage>('lowered')
  const [repCount, setRepCount] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(settings.sessionDurationSeconds)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(false)
  const [isSessionComplete, setIsSessionComplete] = useState(false)
  const [wasFinishedEarly, setWasFinishedEarly] = useState(false)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [isVideoMaximized, setIsVideoMaximized] = useState(false)
  const [showInstructionVideo, setShowInstructionVideo] = useState(true)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [hasRequestedCamera, setHasRequestedCamera] = useState(false)
  const [captureRequested, setCaptureRequested] = useState(false)
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null)
  const [, setShareImageUrl] = useState<string | null>(null)
  const [positioningMessage, setPositioningMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveEmail, setSaveEmail] = useState(() => getLastGuestEmail())
  const [saveName, setSaveName] = useState(() => getLastGuestName())
  const [saveTeam, setSaveTeam] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [paceFeedback, setPaceFeedback] = useState<PaceFeedback | null>(null)
  const lastRepAtRef = useRef<number | null>(null)
  const lastRepIntervalRef = useRef<number | null>(null)
  const repHistoryRef = useRef<RepHistoryEntry[]>([])
  const liveCoachLastRepRef = useRef(0)
  const liveCoachCompletionSentRef = useRef(false)
  const repCountRef = useRef(0)
  const pointsRef = useRef(0)
  const totalSessionSeconds = guestChallenge?.sessionDurationSeconds ?? settings.sessionDurationSeconds
  const finalTenSeconds = isWorkoutRunning && secondsLeft > 0 && secondsLeft <= 10
  const isTrialScoreboardEnabled = Boolean(organizationTrial?.enableNicknames || organizationTrial?.enableTeamNames)
  const isTrialTeamScoreEnabled = Boolean(organizationTrial?.enableTeamNames)
  const isTrialPlankRoute = isTrialWorkout && exerciseParam === 'plank'
  const isTrialPlank = isTrialWorkout && trialDemoStage === 'plank'

  const points = useMemo(() => {
    if (!challenge || !activeChallenge) {
      return 0
    }

    if (challenge.id === 'plank') {
      return repCount
    }

    const perRep = getPointsPerRep(activeChallenge, challenge.id)
    return perRep * repCount
  }, [activeChallenge, challenge, repCount])
  const currentTrialSegmentScore = isTrialPlankRoute ? points : trialDemoStage === 'squats' || trialDemoStage === 'complete' ? trialSquatScore : trialJumpingJackScore
  const currentTrialTotalScore = isTrialPlankRoute ? points : trialJumpingJackScore + (trialDemoStage === 'jumping-jacks' || trialDemoStage === 'transition' ? 0 : trialSquatScore)
  const displayedScore = isTrialWorkout ? currentTrialTotalScore : points

  const aiSettings: AIDemoSettings = useMemo(() => {
    if (isTrialWorkout && organizationTrial) {
      return {
        enableAIOverlay: organizationTrial.enableAiOverlay,
        enableAILiveCoach: organizationTrial.enableAiLiveCoach,
        enableAIAnnouncer: organizationTrial.enableAiAnnouncer,
        enableExecutiveSummary: organizationTrial.enableExecutiveSummary,
        enableCelebrationAnimations: organizationTrial.enableCelebrationAnimations,
      }
    }

    if (activeChallenge) {
      return {
        enableAIOverlay: activeChallenge.enable_ai_overlay ?? DEFAULT_AI_DEMO_SETTINGS.enableAIOverlay,
        enableAILiveCoach: activeChallenge.enable_ai_live_coach ?? false,
        enableAIAnnouncer: activeChallenge.enable_ai_announcer ?? false,
        enableExecutiveSummary: activeChallenge.enable_executive_summary ?? false,
        enableCelebrationAnimations: activeChallenge.enable_celebration_animations ?? DEFAULT_AI_DEMO_SETTINGS.enableCelebrationAnimations,
      }
    }

    return DEFAULT_AI_DEMO_SETTINGS
  }, [activeChallenge, isTrialWorkout, organizationTrial])

  const isTrialAIEnabledForDemo = !isTrialWorkout || (isTrialPlankRoute ? organizationTrial?.enableAiForPlankDemo : organizationTrial?.enableAiForJjSquatDemo)
  const shouldShowAIOverlay = Boolean(aiSettings.enableAIOverlay && isTrialAIEnabledForDemo)
  const shouldUseAILiveCoach = Boolean(aiSettings.enableAILiveCoach && isTrialAIEnabledForDemo)

  useEffect(() => {
    repCountRef.current = repCount
    pointsRef.current = points

    if (!isTrialWorkout) {
      return
    }

    if (trialDemoStage === 'jumping-jacks') {
      setTrialJumpingJackReps(repCount)
      setTrialJumpingJackScore(points)
    }

    if (trialDemoStage === 'squats') {
      setTrialSquatReps(repCount)
      setTrialSquatScore(points)
    }
  }, [isTrialWorkout, points, repCount, trialDemoStage])

  useEffect(() => {
    if (isTrialWorkout) {
      void getOrganizationTrial(trialCode)
        .then((payload) => {
          setOrganizationTrial(payload)
          setActiveChallenge({
            id: payload.id,
            organization_id: 'trial',
            name: payload.organizationName,
            description: payload.displayMessage,
            start_date: payload.createdAt,
            end_date: payload.expiresAt,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            status: 'active',
            squat_points_per_rep: 2,
            burpee_points_per_rep: 1,
            high_knees_points_per_rep: 1,
            lunges_points_per_rep: 2,
            daily_streak_bonus: 0,
            team_streak_bonus: 0,
            max_sessions_per_day: 999,
            enabled_squat: true,
            enabled_burpee: true,
            enabled_high_knees: false,
            enabled_lunges: false,
            qualifying_threshold_type: 'total_points',
            qualifying_threshold_value: 0,
            team_qualification_type: 'fixed_count',
            team_required_unique_members: 1,
            team_required_participation_percent: 0,
            enable_ai_overlay: payload.enableAiOverlay,
            enable_ai_live_coach: payload.enableAiLiveCoach,
            enable_ai_announcer: payload.enableAiAnnouncer,
            enable_executive_summary: payload.enableExecutiveSummary,
            enable_celebration_animations: payload.enableCelebrationAnimations,
            created_at: payload.createdAt,
          })
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load organization trial.'))
      return
    }

    if (isSoloWorkout) {
      const now = new Date()
      setSecondsLeft(settings.sessionDurationSeconds)
      setActiveChallenge({
        id: 'solo-challenge',
        organization_id: 'solo',
        name: 'Solo Progress',
        description: 'Personal daily-best tracking',
        start_date: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        status: 'active',
        squat_points_per_rep: 1,
        burpee_points_per_rep: 2,
        high_knees_points_per_rep: 1,
        lunges_points_per_rep: 2,
        daily_streak_bonus: 0,
        team_streak_bonus: 0,
        max_sessions_per_day: 999,
        enabled_squat: true,
        enabled_burpee: true,
        enabled_high_knees: true,
        enabled_lunges: true,
        qualifying_threshold_type: 'total_points',
        qualifying_threshold_value: 0,
        team_qualification_type: 'fixed_count',
        team_required_unique_members: 1,
        team_required_participation_percent: 0,
        enable_ai_overlay: DEFAULT_AI_DEMO_SETTINGS.enableAIOverlay,
        enable_ai_live_coach: false,
        enable_ai_announcer: false,
        enable_executive_summary: false,
        enable_celebration_animations: DEFAULT_AI_DEMO_SETTINGS.enableCelebrationAnimations,
        created_at: now.toISOString(),
      })
      return
    }

    if (isGuestWorkout) {
      void getGuestChallenge(challengeCode)
        .then((payload) => {
          setGuestChallenge(payload)
          if (getLastGuestChallengeCode() === payload.code) {
            setSaveName((current) => current.trim() || payload.creatorName)
            setSaveEmail((current) => current.trim() || payload.creatorEmail)
          }
          setSecondsLeft(payload.sessionDurationSeconds)
          setActiveChallenge({
            id: payload.id,
            organization_id: 'guest',
            name: payload.title,
            description: 'Player challenge',
            start_date: payload.startDate,
            end_date: payload.endDate,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            status: new Date(payload.endDate) >= new Date() ? 'active' : 'completed',
            squat_points_per_rep: 1,
            burpee_points_per_rep: 2,
            high_knees_points_per_rep: 1,
            lunges_points_per_rep: 2,
            daily_streak_bonus: 0,
            team_streak_bonus: 0,
            max_sessions_per_day: payload.attemptsPerDay,
            enabled_squat: true,
            enabled_burpee: true,
            enabled_high_knees: true,
            enabled_lunges: true,
            qualifying_threshold_type: 'total_points',
            qualifying_threshold_value: 0,
            team_qualification_type: 'fixed_count',
            team_required_unique_members: 1,
            team_required_participation_percent: 0,
            enable_ai_overlay: DEFAULT_AI_DEMO_SETTINGS.enableAIOverlay,
            enable_ai_live_coach: DEFAULT_AI_DEMO_SETTINGS.enableAILiveCoach,
            enable_ai_announcer: DEFAULT_AI_DEMO_SETTINGS.enableAIAnnouncer,
            enable_executive_summary: DEFAULT_AI_DEMO_SETTINGS.enableExecutiveSummary,
            enable_celebration_animations: DEFAULT_AI_DEMO_SETTINGS.enableCelebrationAnimations,
            created_at: payload.createdAt,
          })
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Unable to load player challenge.')
        })
      return
    }

    if (!hasSupabaseConfig) {
      setActiveChallenge({
        id: 'demo-challenge',
        organization_id: 'demo-org',
        name: 'Demo Challenge Window',
        description: 'Local camera test mode',
        start_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        status: 'active',
        squat_points_per_rep: 1,
        burpee_points_per_rep: 2,
        high_knees_points_per_rep: 1,
        lunges_points_per_rep: 2,
        daily_streak_bonus: 0,
        team_streak_bonus: 0,
        max_sessions_per_day: 5,
        enabled_squat: true,
        enabled_burpee: true,
        enabled_high_knees: true,
        enabled_lunges: true,
        qualifying_threshold_type: 'total_points',
        qualifying_threshold_value: 10,
        team_qualification_type: 'fixed_count',
        team_required_unique_members: 3,
        team_required_participation_percent: 25,
        enable_ai_overlay: DEFAULT_AI_DEMO_SETTINGS.enableAIOverlay,
        enable_ai_live_coach: DEFAULT_AI_DEMO_SETTINGS.enableAILiveCoach,
        enable_ai_announcer: DEFAULT_AI_DEMO_SETTINGS.enableAIAnnouncer,
        enable_executive_summary: DEFAULT_AI_DEMO_SETTINGS.enableExecutiveSummary,
        enable_celebration_animations: DEFAULT_AI_DEMO_SETTINGS.enableCelebrationAnimations,
        created_at: new Date().toISOString(),
      })
      return
    }

    if (!configuredOrgCode) {
      setError('Organization context is missing. Open your organization launch URL and tap Start first.')
      return
    }

    void getActiveChallenge(configuredOrgCode)
      .then(setActiveChallenge)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load active challenge.')
      })
  }, [challengeCode, configuredOrgCode, isGuestWorkout, isSoloWorkout, isTrialWorkout, settings.sessionDurationSeconds, trialCode])

  useEffect(() => {
    if (!isTrialWorkout || !trialCode || !isSessionComplete) {
      return
    }

    void getOrganizationTrialScoreSummary(trialCode)
      .then((summary) => {
        setTrialBestScore(Math.max(currentTrialTotalScore, summary.bestScore))
        setTrialBestTeamScore(summary.bestTeamScore)
      })
      .catch(() => {
        setTrialBestScore(currentTrialTotalScore)
        setTrialBestTeamScore(0)
      })
  }, [currentTrialTotalScore, isSessionComplete, isTrialWorkout, trialCode])

  useEffect(() => {
    if (isTrialWorkout && isSessionComplete) {
      setTrialCompletionMessage(TRIAL_COMPLETION_MESSAGES[Math.floor(Math.random() * TRIAL_COMPLETION_MESSAGES.length)])
    }
  }, [isSessionComplete, isTrialWorkout, sessionId])

  useEffect(() => {
    setSecondsLeft(guestChallenge?.sessionDurationSeconds ?? settings.sessionDurationSeconds)
  }, [guestChallenge?.sessionDurationSeconds, settings.sessionDurationSeconds])

  useEffect(() => {
    if (!shouldAutoEnableCamera || !activeChallenge || !challenge || cameraAttempt > 0 || isSessionComplete) {
      return
    }

    setCameraAttempt(1)
  }, [activeChallenge, cameraAttempt, challenge, isSessionComplete, shouldAutoEnableCamera])

  const recordRep = useCallback(() => {
    const now = performance.now()
    const lastRepAt = lastRepAtRef.current
    if (lastRepAt !== null && now - lastRepAt < 650) {
      return
    }

    const previousInterval = lastRepIntervalRef.current
    const nextInterval = lastRepAt === null ? null : now - lastRepAt
    const isSteadyOrFaster = nextInterval === null || previousInterval === null || nextInterval <= previousInterval * 1.08

    lastRepAtRef.current = now
    if (nextInterval !== null) {
      lastRepIntervalRef.current = nextInterval
    }
    repHistoryRef.current = [...repHistoryRef.current, { completedAt: now, intervalMs: nextInterval }].slice(-20)

    setRepCount((value) => value + 1)
    setPaceFeedback({
      id: now,
      tone: isSteadyOrFaster ? 'fast' : 'slow',
      label: isSteadyOrFaster ? '+1 ↑' : '+1',
    })
  }, [])

  const handleRepDetection = useCallback(
    (landmarks: NormalizedLandmark[]) => {
      if (!challenge || isSessionComplete || !isWorkoutRunning) {
        return
      }

      const pose = analyzePose(landmarks, settings.calibration)


      if (shouldShowAIOverlay) {
        setMovementQuality(analyzeMovementQuality({
          exercise: challenge.id,
          landmarks,
          validReps: repCountRef.current,
          attemptedReps: Math.max(repCountRef.current, repHistoryRef.current.length),
          repHistory: repHistoryRef.current,
          elapsedMs: performance.now(),
          confidenceValues: landmarks.map((landmark) => landmark.visibility ?? 1),
        }))
      }

      if (challenge.id === 'plank') {
        setIsPlankPostureValid(pose.isPlank)
        return
      }

      if (challenge.id === 'squat') {
        if (squatStageRef.current === 'standing' && pose.isSquatDepth) {
          squatStageRef.current = 'down'
        }

        if (squatStageRef.current === 'down' && pose.isStanding) {
          squatStageRef.current = 'standing'
          recordRep()
        }
      }

      if (challenge.id === 'burpee') {
        const now = performance.now()
        if (jumpingJackStageRef.current === 'closed' && pose.isJumpingJackOpen) {
          jumpingJackOpenFramesRef.current += 1
          if (jumpingJackOpenFramesRef.current >= 5) {
            jumpingJackStageRef.current = 'open'
            jumpingJackOpenFramesRef.current = 0
            jumpingJackClosedFramesRef.current = 0
          }
        } else if (jumpingJackStageRef.current === 'closed') {
          jumpingJackOpenFramesRef.current = 0
        } else if (pose.isJumpingJackClosed) {
          jumpingJackClosedFramesRef.current += 1
          if (jumpingJackClosedFramesRef.current >= 5 && now - lastJumpingJackRepAtRef.current >= 900) {
            jumpingJackStageRef.current = 'closed'
            jumpingJackOpenFramesRef.current = 0
            jumpingJackClosedFramesRef.current = 0
            lastJumpingJackRepAtRef.current = now
            recordRep()
          }
        } else {
          jumpingJackClosedFramesRef.current = 0
        }
      }

      if (challenge.id === 'high-knees') {
        if (highKneeStageRef.current === 'lowered' && pose.isHighKneeRaised) {
          highKneeStageRef.current = 'raised'
        } else if (highKneeStageRef.current === 'raised' && pose.isHighKneeLowered) {
          highKneeStageRef.current = 'lowered'
          recordRep()
        }
      }

      if (challenge.id === 'lunges') {
        const now = performance.now()
        if (lungeStageRef.current === 'standing') {
          lungeStandingFramesRef.current = 0
          lungeDepthFramesRef.current = pose.isLungeDepth ? lungeDepthFramesRef.current + 1 : 0

          if (lungeDepthFramesRef.current >= 4) {
            lungeStageRef.current = 'down'
            lungeDepthFramesRef.current = 0
          }
        } else {
          lungeDepthFramesRef.current = 0
          lungeStandingFramesRef.current = pose.isStanding ? lungeStandingFramesRef.current + 1 : 0

          if (lungeStandingFramesRef.current >= 4 && now - lastLungeRepAtRef.current >= 650) {
            lungeStageRef.current = 'standing'
            lungeStandingFramesRef.current = 0
            lastLungeRepAtRef.current = now
            recordRep()
          }
        }
      }
    },
    [challenge, isSessionComplete, isWorkoutRunning, recordRep, settings.calibration, shouldShowAIOverlay],
  )

  handleRepDetectionRef.current = handleRepDetection
  challengeRef.current = challenge

  useEffect(() => {
    if (!challengeRef.current || (isSessionComplete && !captureRequested) || cameraAttempt === 0) {
      return
    }

    let active = true

    const setup = async () => {
      if (!videoRef.current || !canvasRef.current) {
        return
      }

      const Camera = (window as Window & { Camera?: CameraConstructor }).Camera
      const Pose = (window as Window & { Pose?: PoseConstructor }).Pose
      const drawConnectors = (window as Window & { drawConnectors?: DrawConnectorFn }).drawConnectors
      const drawLandmarks = (window as Window & { drawLandmarks?: DrawLandmarksFn }).drawLandmarks
      const POSE_CONNECTIONS = (window as Window & { POSE_CONNECTIONS?: unknown }).POSE_CONNECTIONS

      if (!Camera || !Pose || !drawConnectors || !drawLandmarks || !POSE_CONNECTIONS) {
        throw new Error('MediaPipe scripts did not load. Refresh and try again.')
      }

      const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      })

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.35,
        minTrackingConfidence: 0.35,
      })

      pose.onResults((results) => {
        if (!canvasRef.current || !videoRef.current) {
          return
        }

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          return
        }

        canvas.width = videoRef.current.videoWidth || 640
        canvas.height = videoRef.current.videoHeight || 480

        ctx.save()
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)

        const currentChallenge = challengeRef.current
        setPositioningMessage(results.poseLandmarks ? getPositioningMessage(results.poseLandmarks) : null)

        if (currentChallenge?.id === 'squat' || currentChallenge?.id === 'lunges' || currentChallenge?.id === 'high-knees') {
          drawExerciseGuides(ctx, canvas.width, canvas.height, results.poseLandmarks, currentChallenge.id)
        }

        if (results.poseLandmarks) {
          drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#0f766e',
            lineWidth: 4,
          })
          drawLandmarks(ctx, results.poseLandmarks, {
            color: '#f97316',
            lineWidth: 2,
            radius: 3,
          })
          handleRepDetectionRef.current(results.poseLandmarks)
        } else if (currentChallenge?.id === 'plank') {
          setIsPlankPostureValid(false)
        }

        ctx.restore()
      })

      poseRef.current = pose

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (!active || !videoRef.current || isSessionComplete) {
            return
          }
          await pose.send({ image: videoRef.current })
        },
        width: window.matchMedia('(max-width: 640px)').matches ? 720 : 960,
        height: window.matchMedia('(max-width: 640px)').matches ? 1280 : 540,
      })

      cameraRef.current = camera
      await camera.start()
      setIsCameraReady(true)
    }

    void setup().catch((err: unknown) => {
      setIsCameraReady(false)
      setError(getCameraErrorHint(err))
    })

    return () => {
      active = false
      cameraRef.current?.stop()
      poseRef.current?.close()
      cameraRef.current = null
      poseRef.current = null
      setIsCameraReady(false)
    }
  }, [isSessionComplete, cameraAttempt, captureRequested])

  useEffect(() => {
    if (!captureRequested || !isCameraReady) {
      return
    }

    setCaptureCountdown(3)
  }, [captureRequested, isCameraReady])

  useEffect(() => {
    if (!isWorkoutRunning || isSessionComplete) {
      return
    }

    const interval = window.setInterval(() => {
      if (isTrialPlank) {
        if (!isPlankPostureValid) {
          return
        }

        setRepCount((current) => {
          const next = current + 1
          if (next >= totalSessionSeconds) {
            window.clearInterval(interval)
            setIsWorkoutRunning(false)
            setTrialDemoStage('complete')
            setIsSessionComplete(true)
            cameraRef.current?.stop()
          }
          return next
        })
        setSecondsLeft((current) => current + 1)
        return
      }

      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          setIsWorkoutRunning(false)
          if (isTrialWorkout && trialDemoStage === 'jumping-jacks') {
            setTrialJumpingJackReps(repCountRef.current)
            setTrialJumpingJackScore(pointsRef.current)
            setRepCount(0)
            setPaceFeedback(null)
            setTrialTransitionSecondsLeft(15)
            setTrialDemoStage('transition')
            squatStageRef.current = 'standing'
            jumpingJackStageRef.current = 'closed'
            jumpingJackOpenFramesRef.current = 0
            jumpingJackClosedFramesRef.current = 0
            lastJumpingJackRepAtRef.current = 0
            lastRepAtRef.current = null
            lastRepIntervalRef.current = null
          } else {
            if (isTrialWorkout) {
              setTrialSquatReps(repCountRef.current)
              setTrialSquatScore(pointsRef.current)
              setTrialDemoStage('complete')
            }
            setIsSessionComplete(true)
            cameraRef.current?.stop()
          }
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [isPlankPostureValid, isSessionComplete, isTrialPlank, isTrialWorkout, isWorkoutRunning, totalSessionSeconds, trialDemoStage])

  useEffect(() => {
    if (!isTrialWorkout || trialDemoStage !== 'transition') {
      return
    }

    if (trialTransitionSecondsLeft <= 0) {
      startTrialSquatStage()
      return
    }

    const timeout = window.setTimeout(() => {
      setTrialTransitionSecondsLeft((current) => current - 1)
    }, 1000)

    return () => window.clearTimeout(timeout)
  }, [isTrialWorkout, totalSessionSeconds, trialDemoStage, trialTransitionSecondsLeft])

  useEffect(() => {
    if (countdown === null) {
      return
    }

    if (countdown <= 0) {
      setCountdown(null)
      setIsWorkoutRunning(true)
      return
    }

    const timeout = window.setTimeout(() => {
      setCountdown((current) => (current === null ? null : current - 1))
    }, 1000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [countdown])


  useEffect(() => {
    if (!shouldUseAILiveCoach || !movementQuality || !challenge) {
      return
    }

    const reachedFiveRepCadence = repCount > 0 && repCount % 5 === 0 && liveCoachLastRepRef.current !== repCount
    const reachedCompletion = isSessionComplete && !liveCoachCompletionSentRef.current
    if (!reachedFiveRepCadence && !reachedCompletion) {
      return
    }

    if (reachedFiveRepCadence) liveCoachLastRepRef.current = repCount
    if (reachedCompletion) liveCoachCompletionSentRef.current = true

    void generateLiveCoachSentence(buildLiveCoachPayload(challenge.id, movementQuality), true)
      .then((sentence) => {
        if (sentence) setLiveCoachMessage(sentence)
      })
      .catch(() => setLiveCoachError('Live Coach is unavailable. Rule analysis remains active.'))
  }, [challenge, isSessionComplete, movementQuality, repCount, shouldUseAILiveCoach])

  useEffect(() => {
    if (captureCountdown === null) {
      return
    }

    if (captureCountdown > 0) {
      const timeout = window.setTimeout(() => {
        setCaptureCountdown((current) => (current === null ? null : current - 1))
      }, 1000)

      return () => window.clearTimeout(timeout)
    }

    const video = videoRef.current
    const canvas = shareCanvasRef.current
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setCaptureCountdown(null)
      setError('The camera frame is not ready yet. Please try the capture again.')
      return
    }

    const width = video.videoWidth || 720
    const height = video.videoHeight || 1280
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    if (!context) {
      setCaptureCountdown(null)
      setError('Unable to prepare the share image. Please try again.')
      return
    }

    context.fillStyle = '#07111f'
    context.fillRect(0, 0, width, height)
    context.save()
    context.translate(width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, width, height)
    context.restore()

    const panelHeight = Math.max(230, Math.round(height * 0.24))
    context.fillStyle = 'rgba(3, 7, 18, 0.86)'
    context.fillRect(0, height - panelHeight, width, panelHeight)
    context.fillStyle = '#93c5fd'
    context.font = `800 ${Math.max(22, Math.round(width * 0.035))}px Arial`
    context.fillText('FITPERKS', Math.round(width * 0.06), height - panelHeight + Math.round(panelHeight * 0.2))
    context.fillStyle = '#f8fafc'
    context.font = `800 ${Math.max(30, Math.round(width * 0.055))}px Arial`
    context.fillText(challenge?.name.replace(' Challenge', '') ?? 'Workout', Math.round(width * 0.06), height - panelHeight + Math.round(panelHeight * 0.43))
    context.font = `700 ${Math.max(20, Math.round(width * 0.032))}px Arial`
    context.fillStyle = '#cbd5e1'
    context.fillText(`${repCount} reps`, Math.round(width * 0.06), height - panelHeight + Math.round(panelHeight * 0.68))
    context.fillStyle = '#93c5fd'
    context.fillText(`${points} points`, Math.round(width * 0.06), height - panelHeight + Math.round(panelHeight * 0.86))
    context.fillStyle = '#94a3b8'
    context.font = `600 ${Math.max(16, Math.round(width * 0.022))}px Arial`
    context.textAlign = 'right'
    context.fillText('fitperks.org', width - Math.round(width * 0.06), height - panelHeight + Math.round(panelHeight * 0.86))
    context.textAlign = 'left'

    setShareImageUrl(canvas.toDataURL('image/jpeg', 0.9))
    setCaptureRequested(false)
    setCaptureCountdown(null)
  }, [captureCountdown, challenge, points, repCount])

  function startTrialSquatStage() {
    setError(null)
    setTrialTransitionSecondsLeft(0)
    setTrialDemoStage('squats')
    setSecondsLeft(totalSessionSeconds)
    setIsWorkoutRunning(false)
    setCountdown(3)
    setPaceFeedback(null)
    setMovementQuality(null)
    setLiveCoachMessage(null)
    setLiveCoachError(null)
    squatStageRef.current = 'standing'
    lastRepAtRef.current = null
    lastRepIntervalRef.current = null
    repHistoryRef.current = []
  }

  function startWorkout() {
    if (!isCameraReady) {
      if (!hasRequestedCamera) {
        setError('Enable camera first, allow access in the browser prompt, then press Start Workout.')
      } else {
        setError('Camera is not ready. Allow camera access and tap Retry Camera before starting.')
      }
      return
    }

    setError(null)
    if (isTrialWorkout) {
      setTrialDemoStage(exerciseParam === 'plank' ? 'plank' : 'jumping-jacks')
      setTrialTransitionSecondsLeft(15)
      setTrialJumpingJackReps(0)
      setTrialJumpingJackScore(0)
      setTrialSquatReps(0)
      setTrialSquatScore(0)
      setIsPlankPostureValid(false)
    }
    setRepCount(0)
    setPaceFeedback(null)
    setTrialBestScore(null)
    setTrialBestTeamScore(null)
    setSecondsLeft(isTrialWorkout && exerciseParam === 'plank' ? 0 : guestChallenge?.sessionDurationSeconds ?? settings.sessionDurationSeconds)
    setIsSessionComplete(false)
    setWasFinishedEarly(false)
    setIsWorkoutRunning(false)
    squatStageRef.current = 'standing'
    lungeStageRef.current = 'standing'
    lungeDepthFramesRef.current = 0
    lungeStandingFramesRef.current = 0
    lastLungeRepAtRef.current = 0
    jumpingJackStageRef.current = 'closed'
    jumpingJackOpenFramesRef.current = 0
    jumpingJackClosedFramesRef.current = 0
    lastJumpingJackRepAtRef.current = 0
    highKneeStageRef.current = 'lowered'
    lastRepAtRef.current = null
    lastRepIntervalRef.current = null
    repHistoryRef.current = []
    liveCoachLastRepRef.current = 0
    liveCoachCompletionSentRef.current = false
    setMovementQuality(null)
    setLiveCoachMessage(null)
    setLiveCoachError(null)
    setCountdown(3)
  }

  function finishWorkoutEarly() {
    if (!isWorkoutRunning) {
      return
    }

    setError(null)
    setCountdown(null)
    setPaceFeedback(null)
    setWasFinishedEarly(true)
    setIsWorkoutRunning(false)
    if (isTrialWorkout && trialDemoStage === 'jumping-jacks') {
      setTrialJumpingJackReps(repCountRef.current)
      setTrialJumpingJackScore(pointsRef.current)
      setRepCount(0)
      setTrialTransitionSecondsLeft(15)
      setTrialDemoStage('transition')
      return
    }

    if (isTrialWorkout && trialDemoStage === 'squats') {
      setTrialSquatReps(repCountRef.current)
      setTrialSquatScore(pointsRef.current)
      setTrialDemoStage('complete')
    } else if (isTrialPlank) {
      setTrialDemoStage('complete')
    }
    setIsSessionComplete(true)
    cameraRef.current?.stop()
  }

  function retryCamera() {
    setError(null)
    cameraRef.current?.stop()
    poseRef.current?.close()
    cameraRef.current = null
    poseRef.current = null
    setHasRequestedCamera(true)
    setIsCameraReady(false)
    setCameraAttempt((value) => value + 1)
  }

  /* Temporarily disabled with the workout post capture flow. */
  // function captureWorkoutImage() {
  //   setError(null)
  //   setShareImageUrl(null)
  //   if (isCameraReady) {
  //     setCaptureCountdown(3)
  //     return
  //   }
  //
  //   setCaptureRequested(true)
  //   setHasRequestedCamera(true)
  //   setCameraAttempt((value) => value + 1)
  // }

  function retakeWorkout() {
    setError(null)
    setSessionId(nowSessionId())
    setTrialDemoStage(exerciseParam === 'plank' ? 'plank' : 'jumping-jacks')
    setTrialTransitionSecondsLeft(15)
    setTrialJumpingJackReps(0)
    setTrialJumpingJackScore(0)
    setTrialSquatReps(0)
    setTrialSquatScore(0)
    setIsPlankPostureValid(false)
    setRepCount(0)
    setPaceFeedback(null)
    setTrialBestScore(null)
    setTrialBestTeamScore(null)
    setSecondsLeft(isTrialWorkout && exerciseParam === 'plank' ? 0 : totalSessionSeconds)
    setIsSessionComplete(false)
    setWasFinishedEarly(false)
    setIsWorkoutRunning(false)
    setCaptureRequested(false)
    setCaptureCountdown(null)
    setShareImageUrl(null)
    setIsCameraReady(false)
    setHasRequestedCamera(true)
    squatStageRef.current = 'standing'
    lungeStageRef.current = 'standing'
    lungeDepthFramesRef.current = 0
    lungeStandingFramesRef.current = 0
    lastLungeRepAtRef.current = 0
    jumpingJackStageRef.current = 'closed'
    jumpingJackOpenFramesRef.current = 0
    jumpingJackClosedFramesRef.current = 0
    lastJumpingJackRepAtRef.current = 0
    highKneeStageRef.current = 'lowered'
    lastRepAtRef.current = null
    lastRepIntervalRef.current = null
    repHistoryRef.current = []
    liveCoachLastRepRef.current = 0
    liveCoachCompletionSentRef.current = false
    setMovementQuality(null)
    setLiveCoachMessage(null)
    setLiveCoachError(null)
    setCameraAttempt((value) => value + 1)
  }

  // async function shareWorkoutImage() {
  //   if (!shareImageUrl) {
  //     return
  //   }
  //
  //   const response = await fetch(shareImageUrl)
  //   const blob = await response.blob()
  //   const file = new File([blob], 'fitperks-workout.jpg', { type: 'image/jpeg' })
  //
  //   if (navigator.share && navigator.canShare?.({ files: [file] })) {
  //     await navigator.share({
  //       title: `${challenge?.name ?? 'FitPerks workout'} result`,
  //       text: `${repCount} reps and ${points} points on FitPerks`,
  //       files: [file],
  //     })
  //     return
  //   }
  //
  //   window.open(shareImageUrl, '_blank', 'noopener,noreferrer')
  // }

  async function submitWorkout() {
    if (!challenge) {
      return
    }

    try {
      setIsSubmitting(true)
      if (!hasSupabaseConfig && !isGuestWorkout && !isSoloWorkout) {
        clearParticipantProfile()
        navigate('/challenges')
        return
      }

      if (isTrialWorkout) {
        if (!trialCode) {
          throw new Error('Organization trial code is missing.')
        }

        if (isTrialPlankRoute) {
          navigate(`/trial/${trialCode}/workout`)
          return
        }

        if (organizationTrial?.enableNicknames && !saveName.trim()) {
          throw new Error('Nickname is required to save your score.')
        }

        await Promise.all([
          submitOrganizationTrialResult({
            code: trialCode,
            nickname: organizationTrial?.enableNicknames ? saveName : undefined,
            teamName: saveTeam,
            sessionId,
            exercise: 'burpee',
            reps: trialJumpingJackReps,
          }),
          submitOrganizationTrialResult({
            code: trialCode,
            nickname: organizationTrial?.enableNicknames ? saveName : undefined,
            teamName: saveTeam,
            sessionId: crypto.randomUUID(),
            exercise: 'squat',
            reps: trialSquatReps,
          }),
        ])
        navigate(`/trial/${trialCode}/workout`)
        return
      }

      if (isSoloWorkout) {
        if (!standardExercise) {
          throw new Error('Invalid solo workout.')
        }

        if (!saveEmail.trim()) {
          throw new Error('Email is required to save solo progress.')
        }

        await submitSoloAttempt({
          playerName: saveName.trim() || 'Solo Player',
          playerEmail: saveEmail.trim(),
          sessionId,
          exercise: standardExercise,
          reps: repCount,
        })

        saveGuestJoinContext({ guestName: saveName.trim() || 'Solo Player', guestEmail: saveEmail.trim(), challengeCode: 'solo' })
        navigate(`/solo?email=${encodeURIComponent(saveEmail.trim().toLowerCase())}`)
        return
      }

      if (isGuestWorkout) {
        if (!challengeCode) {
          throw new Error('Player challenge code is missing.')
        }

        if (!standardExercise) {
          throw new Error('Invalid player challenge workout.')
        }

        if (!saveName.trim()) {
          throw new Error('Player name is required to save your score.')
        }

        if (!saveEmail.trim()) {
          throw new Error('Player email is required to save your score. Return to Join Challenge and enter it first.')
        }

        await submitGuestAttempt({
          code: challengeCode,
          guestName: saveName.trim(),
          guestEmail: saveEmail.trim(),
          sessionId,
          exercise: standardExercise,
          reps: repCount,
        })

        saveGuestJoinContext({ guestName: saveName.trim(), guestEmail: saveEmail.trim(), challengeCode })
        navigate(`/guest/${challengeCode}/scoreboard`)
        return
      }

      if (!configuredOrgCode) {
        throw new Error('Organization context is missing. Open your organization launch URL and tap Start first.')
      }

      if (!standardExercise) {
        throw new Error('Invalid organization workout.')
      }

      if (!saveEmail.trim()) {
        throw new Error('Email is required to save streak progress.')
      }

      const profile = await joinOrganizationAndRegister({
        organizationCode: configuredOrgCode,
        name: saveName.trim() || 'Participant',
        team: saveTeam.trim() || 'General',
        email: saveEmail.trim(),
      })
      saveParticipantProfile(profile)

      await submitWorkoutSecure({
        sessionId,
        exercise: standardExercise,
        reps: repCount,
      })

      clearParticipantProfile()
      navigate('/challenges')
    } catch (err) {
      const message = getErrorMessage(err, 'Unable to submit workout.')
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!challenge) {
    return <Navigate to="/challenges" replace />
  }

  if (!activeChallenge) {
    return (
      <main className="page">
        <section className="panel">
          <p>Loading active challenge...</p>
        </section>
      </main>
    )
  }

  if (settingsLoading) {
    return (
      <main className="page">
        <section className="panel">
          <p>Loading event settings...</p>
        </section>
      </main>
    )
  }

  const standardExercise = challenge.id === 'plank' ? null : challenge.id
  const challengeVideoPath = standardExercise ? CHALLENGE_VIDEO_PATH[standardExercise] : null
  const shouldShowInstructionVideo = showInstructionVideo && challengeVideoPath && trialDemoStage !== 'transition'

  if (
    (standardExercise && !isTrialWorkout && !isSoloWorkout && !settings.enabledChallenges[standardExercise]) ||
    (standardExercise && activeChallenge && !isExerciseEnabled(activeChallenge, standardExercise)) ||
    (standardExercise && isGuestWorkout && guestChallenge && !guestChallenge.selectedExercises.includes(standardExercise)) ||
    (isTrialPlankRoute && organizationTrial && !organizationTrial.enablePlankDemo) ||
    (isTrialWorkout && challenge.id !== 'squat' && challenge.id !== 'burpee' && challenge.id !== 'plank')
  ) {
    return (
      <main className="page">
        <section className="panel">
          <h1>{challenge.name} is currently disabled</h1>
          <p>The admin has paused this challenge for the current event session.</p>
          <Link className="button ghost" to={isTrialWorkout ? `/trial/${trialCode}/workout` : '/challenges'}>
            {isTrialWorkout ? 'Back to trial workout' : 'Back to challenges'}
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel workout-panel">
        <h1>{organizationTrial?.organizationName ?? guestChallenge?.title ?? challenge.name}</h1>

        {!hasSupabaseConfig && !isGuestWorkout && !isSoloWorkout ? (
          <p className="hint">Demo mode active: camera and rep counting work locally, results are not saved.</p>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="workout-grid">
          <div className="workout-live-view">
            <div className={`camera-wrapper ${isVideoMaximized ? 'camera-wrapper-maximized' : ''}`}>
              <video ref={videoRef} className="camera-feed" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="camera-overlay" />
              <button
                className="video-size-toggle"
                type="button"
                onClick={() => setIsVideoMaximized((value) => !value)}
                aria-pressed={isVideoMaximized}
              >
                {isVideoMaximized ? 'Minimize self view' : 'Maximize self view'}
              </button>
              {positioningMessage ? (
                <div className="workout-positioning-message" aria-live="polite">
                  {positioningMessage}
                </div>
              ) : null}
              <div className="workout-counter-overlay" aria-live="polite">
                <span>Valid reps</span>
                <strong className={paceFeedback ? 'counter-pulse' : ''}>{repCount}</strong>
              </div>
              {isWorkoutRunning ? (
                <div className={`workout-timer-overlay ${finalTenSeconds ? 'workout-timer-overlay-urgent' : ''}`} aria-live="polite">
                  {secondsLeft}s
                </div>
              ) : null}
              {captureCountdown !== null ? (
                <div className="workout-capture-countdown" aria-live="assertive">{captureCountdown || 'POSE'}</div>
              ) : null}
              {countdown !== null ? (
                <div className="workout-start-countdown" aria-live="assertive">{countdown || 'GO!'}</div>
              ) : null}
              {isTrialWorkout && trialDemoStage === 'transition' ? (
                <section className="trial-camera-result" aria-live="polite">
                  <p className="trial-camera-result-title">1/2 Completed</p>
                  <video
                    key="transition-squat-preview"
                    className="trial-transition-video"
                    autoPlay
                    loop
                    muted
                    playsInline
                    aria-label="Squat demonstration preview"
                  >
                    <source src={CHALLENGE_VIDEO_PATH.squat} type="video/mp4" />
                  </video>
                  <dl>
                    <div><dt>Jumping Jacks</dt><dd>{trialJumpingJackScore}</dd></div>
                    <div><dt>Next</dt><dd>Squats</dd></div>
                    <div><dt>Starts In</dt><dd>{trialTransitionSecondsLeft}s</dd></div>
                  </dl>
                  <button className="button primary trial-transition-next" type="button" onClick={startTrialSquatStage}>
                    Next workout
                  </button>
                </section>
              ) : null}
              {isTrialWorkout && isSessionComplete ? (
                <section className="trial-camera-result" aria-live="polite">
                  <p className="trial-camera-result-title">{isTrialPlankRoute ? 'Plank Completed' : '2/2 Completed'}</p>
                  {trialCompletionMessage ? <p className="trial-camera-result-message">{trialCompletionMessage}</p> : null}
                  <dl>
                    {isTrialPlankRoute ? (
                      <>
                        <div><dt>Valid Hold</dt><dd>{currentTrialTotalScore}s</dd></div>
                        <div><dt>Goal</dt><dd>{totalSessionSeconds}s</dd></div>
                      </>
                    ) : (
                      <>
                        <div><dt>Jumping Jacks</dt><dd>{trialJumpingJackScore}</dd></div>
                        <div><dt>Squats</dt><dd>{trialSquatScore}</dd></div>
                        <div><dt>Full Score</dt><dd>{currentTrialTotalScore}</dd></div>
                        {isTrialTeamScoreEnabled ? <div><dt>Best Team Score</dt><dd>{trialBestTeamScore ?? 0}</dd></div> : isTrialScoreboardEnabled ? <div><dt>Best Score</dt><dd>{trialBestScore ?? currentTrialTotalScore}</dd></div> : null}
                      </>
                    )}
                  </dl>
                  {isTrialTeamScoreEnabled && !isTrialPlankRoute ? <p className="trial-camera-result-caption">Best team score in challenge</p> : null}
                </section>
              ) : null}

            </div>
            <p className="camera-privacy-note">
              Camera video and images are used only to track your workout. FitPerks does not store them.
            </p>
          </div>

          <aside className="stats-panel">
            {shouldShowInstructionVideo ? (
              <video
                key={challengeVideoPath}
                className="workout-instruction-video"
                autoPlay
                loop
                muted
                playsInline
                controls
                onError={() => setShowInstructionVideo(false)}
                aria-label={`${challenge.name} demonstration`}
              >
                <source src={challengeVideoPath} type="video/mp4" />
              </video>
            ) : null}
            <p className="sidebar-exercise-line" title={`${challenge.name}${isTrialWorkout && !isTrialPlankRoute ? ` · ${trialDemoStage === 'jumping-jacks' ? '1/2' : '2/2'}` : ''}`}>
              <span>Exercise:</span> <strong>{challenge.name.replace(' Challenge', '')}</strong>
              {isTrialWorkout && !isTrialPlankRoute ? <span className="table-muted"> · {trialDemoStage === 'jumping-jacks' ? '1/2' : '2/2'}</span> : null}
            </p>
            <p>
              {isTrialWorkout ? 'Player score' : 'Points earned'}:{' '}
              <strong className={`counter-value ${paceFeedback ? 'counter-pulse' : ''}`} key={`points-${paceFeedback?.id ?? 0}`}>
                {displayedScore}
              </strong>
            </p>
            {isTrialWorkout ? (
              <>
                {isTrialPlankRoute ? (
                  <p>Posture: <strong>{isPlankPostureValid && isWorkoutRunning ? 'Valid' : 'Paused'}</strong></p>
                ) : null}
                {isWorkoutRunning ? <p>Current round score: <strong>{currentTrialSegmentScore}</strong></p> : null}
              </>
            ) : null}
            {shouldShowAIOverlay && movementQuality ? (
              <AILivePanel
                quality={movementQuality}
                liveCoachMessage={liveCoachMessage}
                liveCoachEnabled={shouldUseAILiveCoach}
              />
            ) : null}
            {liveCoachError ? <p className="hint">{liveCoachError}</p> : null}
            {!isCameraReady && !isSessionComplete ? (
              <p className="hint">
                {hasRequestedCamera
                  ? 'Waiting for camera access...'
                  : 'Allow camera access to begin.'}
              </p>
            ) : null}

            {!isSessionComplete && trialDemoStage !== 'transition' && countdown === null && !isWorkoutRunning ? (
              <div className="workout-start-actions">
                <p className="hint">Step into frame, then start from the side panel.</p>
                {!isCameraReady ? (
                  <button className="button primary workout-start-button" type="button" onClick={retryCamera}>
                    {hasRequestedCamera ? 'Retry Camera' : 'Enable Camera'}
                  </button>
                ) : (
                  <button className="button primary workout-start-button" type="button" onClick={startWorkout}>
                    Start Workout
                  </button>
                )}
              </div>
            ) : null}

            {isWorkoutRunning ? (
              <div className="workout-finish-actions">
                <p className="hint">Workout in progress.</p>
                <button className="button ghost workout-finish-button" type="button" onClick={finishWorkoutEarly}>
                  Finish workout
                </button>
              </div>
            ) : null}

            {isSessionComplete ? (
              <div className="stack">
                {wasFinishedEarly && !isTrialWorkout ? <p className="hint">Workout stopped. Your latest score is ready to save.</p> : null}
                {isTrialWorkout ? (
                  <>
                    {organizationTrial?.enableNicknames && !isTrialPlankRoute ? (
                      <label>
                        Nickname
                        <input
                          value={saveName}
                          onChange={(event) => setSaveName(event.target.value)}
                          placeholder="Your scoreboard name"
                        />
                      </label>
                    ) : null}
                    {organizationTrial?.enableTeamNames && !isTrialPlankRoute ? (
                      <label>
                        Team
                        <select
                          value={saveTeam}
                          onChange={(event) => setSaveTeam(event.target.value)}
                        >
                          <option value="">No team</option>
                          {organizationTrial.teamNames.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}
                        </select>
                      </label>
                    ) : null}
                    {isTrialScoreboardEnabled && !isTrialPlankRoute ? (
                      <button className="button primary" type="button" onClick={() => void submitWorkout()} disabled={isSubmitting}>
                        {isSubmitting ? 'Finishing...' : 'Finish session'}
                      </button>
                    ) : null}
                    <button className="button ghost" type="button" onClick={retakeWorkout} disabled={isSubmitting || captureCountdown !== null || captureRequested}>
                      {isTrialScoreboardEnabled && !isTrialPlankRoute ? 'Retake workout' : 'New workout'}
                    </button>
                    <Link className="button ghost" to={`/trial/${trialCode}/workout`}>Back to trial</Link>
                  </>
                ) : (
                  <>
                {isGuestWorkout || isSoloWorkout ? (
                  <label>
                    Player email
                    <input
                      type="email"
                      value={saveEmail}
                      onChange={(event) => setSaveEmail(event.target.value)}
                      placeholder="name@example.com"
                      required
                    />
                  </label>
                ) : (
                  <label>
                    Email (required for streak storage)
                    <input
                      type="email"
                      value={saveEmail}
                      onChange={(event) => setSaveEmail(event.target.value)}
                      placeholder="name@company.com"
                      required
                    />
                  </label>
                )}
                <label>
                  {isGuestWorkout ? 'Nickname' : isSoloWorkout ? 'Name' : 'Nickname (optional)'}
                  <input
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="Alex"
                    required={isGuestWorkout || isSoloWorkout}
                  />
                </label>
                {isGuestWorkout || isSoloWorkout ? null : (
                  <label>
                    Team (optional)
                    <input
                      value={saveTeam}
                      onChange={(event) => setSaveTeam(event.target.value)}
                      placeholder="Engineering"
                    />
                  </label>
                )}
                <button className="button primary" onClick={() => void submitWorkout()} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : isGuestWorkout ? 'Save Score' : isSoloWorkout ? 'Save Solo Score' : 'Save Workout'}
                </button>
                <button className="button ghost" type="button" onClick={retakeWorkout} disabled={isSubmitting || captureCountdown !== null || captureRequested}>
                  Retake workout
                </button>
                  </>
                )}
              </div>
            ) : null}

            {!(isTrialWorkout && isSessionComplete) ? (
              <Link className="button ghost workout-back-link" to={isTrialWorkout ? `/trial/${trialCode}/workout` : isGuestWorkout ? `/guest/${challengeCode}` : isSoloWorkout ? '/solo' : '/challenges'}>
                {isTrialWorkout ? 'Back to trial workout' : isGuestWorkout ? 'Back to player challenge' : isSoloWorkout ? 'Back to solo' : 'Back to challenges'}
              </Link>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  )
}
