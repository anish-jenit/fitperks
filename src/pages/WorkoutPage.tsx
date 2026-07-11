import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEventSettings } from '../hooks/useEventSettings'
import { CHALLENGES } from '../lib/constants'
import { analyzePose } from '../lib/poseUtils'
import { getActiveChallenge, joinOrganizationAndRegister, nowSessionId, submitWorkoutSecure } from '../lib/supabaseApi'
import { hasSupabaseConfig } from '../lib/supabase'
import { clearParticipantProfile, getConfiguredOrganizationCode, saveParticipantProfile } from '../lib/storage'
import type { ChallengeRecord, ExerciseType } from '../types'

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

export function WorkoutPage() {
  const { exercise: exerciseParam } = useParams()
  const navigate = useNavigate()

  const configuredOrgCode = getConfiguredOrganizationCode()
  const { settings, loading: settingsLoading } = useEventSettings()
  const exercise = (exerciseParam ?? '') as ExerciseType
  const challenge = CHALLENGES.find((item) => item.id === exercise)
  const [activeChallenge, setActiveChallenge] = useState<ChallengeRecord | null>(null)
  const [sessionId] = useState(nowSessionId())

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const poseRef = useRef<PoseInstance | null>(null)
  const cameraRef = useRef<CameraInstance | null>(null)

  const squatStageRef = useRef<SquatStage>('standing')
  const jumpingJackStageRef = useRef<JumpingJackStage>('closed')
  const [repCount, setRepCount] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(settings.sessionDurationSeconds)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(false)
  const [isSessionComplete, setIsSessionComplete] = useState(false)
  const [isCameraReady, setIsCameraReady] = useState(false)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [hasRequestedCamera, setHasRequestedCamera] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveEmail, setSaveEmail] = useState('')
  const [saveName, setSaveName] = useState('')
  const [saveTeam, setSaveTeam] = useState('')
  const [error, setError] = useState<string | null>(null)

  const points = useMemo(() => {
    if (!challenge || !activeChallenge) {
      return 0
    }

    const perRep = challenge.id === 'squat' ? activeChallenge.squat_points_per_rep : activeChallenge.burpee_points_per_rep
    return perRep * repCount
  }, [activeChallenge, challenge, repCount])

  useEffect(() => {
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
        daily_streak_bonus: 0,
        team_streak_bonus: 0,
        max_sessions_per_day: 5,
        enabled_squat: true,
        enabled_burpee: true,
        qualifying_threshold_type: 'total_points',
        qualifying_threshold_value: 10,
        team_qualification_type: 'fixed_count',
        team_required_unique_members: 3,
        team_required_participation_percent: 25,
        created_at: new Date().toISOString(),
      })
      return
    }

    if (!configuredOrgCode) {
      setError('Kiosk org code is not configured. Set VITE_DEFAULT_ORG_CODE before running live saves.')
      return
    }

    void getActiveChallenge(configuredOrgCode)
      .then(setActiveChallenge)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load active challenge.')
      })
  }, [configuredOrgCode])

  useEffect(() => {
    setSecondsLeft(settings.sessionDurationSeconds)
  }, [settings.sessionDurationSeconds])

  const handleRepDetection = useCallback(
    (landmarks: NormalizedLandmark[]) => {
      if (!challenge || isSessionComplete || !isWorkoutRunning) {
        return
      }

      const pose = analyzePose(landmarks, settings.calibration)

      if (challenge.id === 'squat') {
        if (squatStageRef.current === 'standing' && pose.isSquatDepth) {
          squatStageRef.current = 'down'
        }

        if (squatStageRef.current === 'down' && pose.isStanding) {
          squatStageRef.current = 'standing'
          setRepCount((value) => value + 1)
        }
      }

      if (challenge.id === 'burpee') {
        if (jumpingJackStageRef.current === 'closed' && pose.isJumpingJackOpen) {
          jumpingJackStageRef.current = 'open'
        } else if (jumpingJackStageRef.current === 'open' && pose.isJumpingJackClosed) {
          jumpingJackStageRef.current = 'closed'
          setRepCount((value) => value + 1)
        }
      }
    },
    [challenge, isSessionComplete, isWorkoutRunning, settings.calibration],
  )

  useEffect(() => {
    if (!challenge || isSessionComplete || cameraAttempt === 0) {
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
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
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
          handleRepDetection(results.poseLandmarks)
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
        width: 960,
        height: 540,
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
  }, [challenge, isSessionComplete, handleRepDetection, cameraAttempt])

  useEffect(() => {
    if (!isWorkoutRunning || isSessionComplete) {
      return
    }

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          setIsSessionComplete(true)
          setIsWorkoutRunning(false)
          cameraRef.current?.stop()
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [isSessionComplete, isWorkoutRunning])

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
    setRepCount(0)
    setSecondsLeft(settings.sessionDurationSeconds)
    setIsSessionComplete(false)
    setIsWorkoutRunning(false)
    squatStageRef.current = 'standing'
    jumpingJackStageRef.current = 'closed'
    setCountdown(3)
  }

  function retryCamera() {
    setError(null)
    setHasRequestedCamera(true)
    setIsCameraReady(false)
    setCameraAttempt((value) => value + 1)
  }

  async function submitWorkout() {
    if (!challenge) {
      return
    }

    try {
      setIsSubmitting(true)
      if (!hasSupabaseConfig) {
        clearParticipantProfile()
        navigate('/challenges')
        return
      }

      if (!configuredOrgCode) {
        throw new Error('Organization code is not configured on this kiosk.')
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
        exercise: challenge.id,
        reps: repCount,
      })

      clearParticipantProfile()
      navigate('/challenges')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit workout.')
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

  if (!settings.enabledChallenges[challenge.id]) {
    return (
      <main className="page">
        <section className="panel">
          <h1>{challenge.name} is currently disabled</h1>
          <p>The admin has paused this challenge for the current event session.</p>
          <Link className="button ghost" to="/challenges">
            Back to challenges
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="panel workout-panel">
        <h1>{challenge.name}</h1>

        {!hasSupabaseConfig ? (
          <p className="hint">Demo mode active: camera and rep counting work locally, results are not saved.</p>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <div className="workout-grid">
          <div className="camera-wrapper">
            <video ref={videoRef} className="camera-feed" playsInline muted autoPlay />
            <canvas ref={canvasRef} className="camera-overlay" />
          </div>

          <aside className="stats-panel">
            <p>
              Exercise: <strong>{challenge.name}</strong>
            </p>
            <p>
              Valid reps: <strong>{repCount}</strong>
            </p>
            <p>
              Points earned: <strong>{points}</strong>
            </p>
            <p>
              Timer: <strong>{secondsLeft}s</strong>
            </p>
            <p className="hint">Camera processing is on-device only. No videos are uploaded.</p>

            {!isCameraReady ? (
              <button className="button ghost" type="button" onClick={retryCamera}>
                {hasRequestedCamera ? 'Retry Camera' : 'Enable Camera'}
              </button>
            ) : null}

            {!isCameraReady ? (
              <p className="hint">
                {hasRequestedCamera
                  ? 'Waiting for camera access...'
                  : 'Tap Enable Camera to allow browser camera permission.'}
              </p>
            ) : null}

            {!isSessionComplete && countdown === null && !isWorkoutRunning ? (
              <div className="stack">
                <p className="hint">Step into frame, get ready, and press start when positioned.</p>
                <button className="button primary" onClick={startWorkout}>
                  Start Workout
                </button>
              </div>
            ) : null}

            {countdown !== null ? (
              <div className="stack">
                <p>
                  Starting in <strong>{countdown > 0 ? countdown : 'Go!'}</strong>
                </p>
              </div>
            ) : null}

            {isWorkoutRunning ? <p className="hint">Workout in progress.</p> : null}

            {isSessionComplete ? (
              <div className="stack">
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
                <label>
                  Nickname (optional)
                  <input
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="Alex"
                  />
                </label>
                <label>
                  Team (optional)
                  <input
                    value={saveTeam}
                    onChange={(event) => setSaveTeam(event.target.value)}
                    placeholder="Engineering"
                  />
                </label>
                <button className="button primary" onClick={() => void submitWorkout()} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Workout'}
                </button>
              </div>
            ) : null}

            <Link className="button ghost" to="/challenges">
              Back to challenges
            </Link>
          </aside>
        </div>
      </section>
    </main>
  )
}
