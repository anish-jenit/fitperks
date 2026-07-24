import type { CalibrationSettings } from '../lib/settings'
import type { ExerciseType } from '../types'

export type QualityRating = 'Excellent' | 'Good' | 'Fair' | 'Needs Improvement' | 'Poor'

export type MovementQuality = {
  movementScore: number
  repAccuracy: QualityRating
  squatDepth: QualityRating
  tempo: QualityRating
  consistency: QualityRating
  balance: QualityRating
  coachingHint: string
  statusItems: Array<{ label: string; tone: 'good' | 'warn' | 'bad'; active: boolean; level: 1 | 2 | 3 }>
}

type NormalizedLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type RepHistoryEntry = {
  completedAt: number
  intervalMs: number | null
}

export type MovementAnalysisInput = {
  exercise: ExerciseType | 'plank'
  landmarks: NormalizedLandmark[]
  validReps: number
  attemptedReps: number
  repHistory: RepHistoryEntry[]
  elapsedMs?: number
  calibration?: CalibrationSettings
  confidenceValues?: number[]
}

const DEFAULT_QUALITY: MovementQuality = {
  movementScore: 0,
  repAccuracy: 'Needs Improvement',
  squatDepth: 'Needs Improvement',
  tempo: 'Needs Improvement',
  consistency: 'Needs Improvement',
  balance: 'Needs Improvement',
  coachingHint: 'Step fully into frame to begin analysis.',
  statusItems: [
    { label: 'No Rep Yet', tone: 'warn', active: false, level: 1 },
    { label: 'Good Depth', tone: 'warn', active: false, level: 2 },
    { label: 'Stable Balance', tone: 'warn', active: false, level: 2 },
    { label: 'Consistent Movement', tone: 'warn', active: false, level: 2 },
    { label: 'Controlled Tempo', tone: 'warn', active: false, level: 2 },
  ],
}

function angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const abX = a.x - b.x
  const abY = a.y - b.y
  const cbX = c.x - b.x
  const cbY = c.y - b.y
  const dot = abX * cbX + abY * cbY
  const magAB = Math.hypot(abX, abY)
  const magCB = Math.hypot(cbX, cbY)
  if (!magAB || !magCB) return 180
  return Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180 / Math.PI
}

function ratingFromScore(score: number): QualityRating {
  if (score >= 95) return 'Excellent'
  if (score >= 90) return 'Good'
  if (score >= 80) return 'Fair'
  return 'Needs Improvement'
}

function scoreFromRating(rating: QualityRating): number {
  if (rating === 'Excellent') return 100
  if (rating === 'Good') return 88
  if (rating === 'Fair') return 72
  if (rating === 'Poor') return 52
  return 45
}

function squatDepthRating(kneeAngle: number, hipHeightFromKnee: number, exercise: ExerciseType | 'plank', calibration?: CalibrationSettings): QualityRating {
  if (exercise !== 'squat') return 'Good'

  const squatKneeMax = calibration?.squat.squatKneeMax ?? 145
  const squatHipDropMax = calibration?.squat.squatHipDropMax ?? 0.2
  const meetsRepDepth = kneeAngle < squatKneeMax && hipHeightFromKnee < squatHipDropMax

  if (!meetsRepDepth) {
    const closeToKneeDepth = kneeAngle < squatKneeMax + 12
    const closeToHipDrop = hipHeightFromKnee < squatHipDropMax + 0.08
    return closeToKneeDepth && closeToHipDrop ? 'Fair' : 'Needs Improvement'
  }

  const extraKneeDepth = squatKneeMax - kneeAngle
  const extraHipDrop = squatHipDropMax - hipHeightFromKnee
  if (extraKneeDepth >= 35 && extraHipDrop >= 0.08) return 'Excellent'
  return 'Good'
}

function tempoRating(repHistory: RepHistoryEntry[], elapsedMs = 0): QualityRating {
  const intervals = repHistory.map((entry) => entry.intervalMs).filter((value): value is number => typeof value === 'number')
  const latestRepAgeMs = repHistory.length > 0 ? Math.max(0, elapsedMs - repHistory[repHistory.length - 1].completedAt) : null

  if (repHistory.length === 0) return 'Needs Improvement'
  if (latestRepAgeMs !== null && latestRepAgeMs > 6000) return 'Needs Improvement'
  if (latestRepAgeMs !== null && latestRepAgeMs > 4000) return 'Fair'
  if (intervals.length === 0) return 'Fair'

  const latestSeconds = intervals[intervals.length - 1] / 1000
  if (latestSeconds >= 1 && latestSeconds <= 2) return 'Excellent'
  if (latestSeconds >= 0.5 && latestSeconds <= 4) return 'Good'
  if (latestSeconds < 0.5 || latestSeconds > 4) return 'Fair'
  return 'Poor'
}

function consistencyRating(repHistory: RepHistoryEntry[]): QualityRating {
  const intervals = repHistory.map((entry) => entry.intervalMs).filter((value): value is number => typeof value === 'number')
  if (intervals.length < 3) return 'Good'
  const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
  const variance = intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length
  const coefficient = Math.sqrt(variance) / mean
  if (coefficient <= 0.12) return 'Excellent'
  if (coefficient <= 0.22) return 'Good'
  if (coefficient <= 0.38) return 'Fair'
  return 'Needs Improvement'
}

function balanceRating(landmarks: NormalizedLandmark[]): QualityRating {
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  const leftHip = landmarks[23]
  const rightHip = landmarks[24]
  const leftAnkle = landmarks[27]
  const rightAnkle = landmarks[28]
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftAnkle || !rightAnkle) return 'Needs Improvement'

  const shoulderSymmetry = Math.abs(leftShoulder.y - rightShoulder.y)
  const hipSymmetry = Math.abs(leftHip.y - rightHip.y)
  const bodyLean = Math.abs(((leftShoulder.x + rightShoulder.x) / 2) - ((leftHip.x + rightHip.x) / 2))
  const footStability = Math.abs(leftAnkle.y - rightAnkle.y)
  const total = shoulderSymmetry + hipSymmetry + bodyLean + footStability
  if (total <= 0.08) return 'Excellent'
  if (total <= 0.14) return 'Good'
  if (total <= 0.24) return 'Fair'
  return 'Needs Improvement'
}

function statusLevel(rating: QualityRating): 1 | 2 | 3 {
  if (rating === 'Excellent' || rating === 'Good') return 3
  if (rating === 'Fair') return 2
  return 1
}

function statusTone(rating: QualityRating): 'good' | 'warn' | 'bad' {
  if (rating === 'Excellent' || rating === 'Good') return 'good'
  return 'warn'
}

function wasRepDetectedRecently(repHistory: RepHistoryEntry[]): boolean {
  const latest = repHistory[repHistory.length - 1]?.completedAt
  if (typeof latest !== 'number') return false
  const now = typeof performance !== 'undefined' ? performance.now() : latest
  return now - latest <= 1400
}

function hintFor(input: {
  exercise: ExerciseType | 'plank'
  kneeAngle: number
  depth: QualityRating
  tempo: QualityRating
  consistency: QualityRating
  balance: QualityRating
}): string {
  if (input.depth === 'Fair' || input.depth === 'Poor' || input.depth === 'Needs Improvement') {
    if (input.exercise === 'squat') {
      if (input.kneeAngle > 145) return 'Squat lower with a clear knee bend.'
      return 'Drop the hips a little lower before standing.'
    }
    return 'Use a fuller movement range.'
  }
  if (input.tempo === 'Fair' || input.tempo === 'Poor' || input.tempo === 'Needs Improvement') return 'Keep a controlled one to two second rhythm.'
  if (input.balance === 'Fair' || input.balance === 'Needs Improvement') return 'Keep shoulders and hips aligned.'
  if (input.consistency === 'Fair' || input.consistency === 'Needs Improvement') return 'Repeat the same movement range.'
  return 'Maintain this rhythm and posture.'
}

export function analyzeMovementQuality(input: MovementAnalysisInput): MovementQuality {
  if (input.landmarks.length < 29) return DEFAULT_QUALITY

  const attemptedReps = Math.max(input.attemptedReps, input.validReps, 1)
  const accuracyScore = Math.min(100, Math.round((input.validReps / attemptedReps) * 100))
  const repAccuracy = ratingFromScore(accuracyScore)
  const leftKneeAngle = angle(input.landmarks[23], input.landmarks[25], input.landmarks[27])
  const rightKneeAngle = angle(input.landmarks[24], input.landmarks[26], input.landmarks[28])
  const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2
  const avgHipY = (input.landmarks[23].y + input.landmarks[24].y) / 2
  const avgKneeY = (input.landmarks[25].y + input.landmarks[26].y) / 2
  const hipHeightFromKnee = avgKneeY - avgHipY
  const depth = squatDepthRating(kneeAngle, hipHeightFromKnee, input.exercise, input.calibration)
  const tempo = input.exercise === 'plank' ? 'Good' : tempoRating(input.repHistory, input.elapsedMs)
  const consistency = consistencyRating(input.repHistory)
  const balance = balanceRating(input.landmarks)
  const movementScore = Math.round(
    accuracyScore * 0.4 +
    scoreFromRating(depth) * 0.2 +
    scoreFromRating(tempo) * 0.15 +
    scoreFromRating(consistency) * 0.15 +
    scoreFromRating(balance) * 0.1,
  )

  const repDetectedRecently = wasRepDetectedRecently(input.repHistory)

  return {
    movementScore,
    repAccuracy,
    squatDepth: depth,
    tempo,
    consistency,
    balance,
    coachingHint: hintFor({ exercise: input.exercise, kneeAngle, depth, tempo, consistency, balance }),
    statusItems: [
      { label: repDetectedRecently ? 'Rep' : 'No Rep', tone: repDetectedRecently ? 'good' : 'warn', active: repDetectedRecently, level: repDetectedRecently ? 3 : 1 },
      { label: input.exercise === 'squat' ? 'Depth' : 'Range', tone: statusTone(depth), active: statusLevel(depth) === 3, level: statusLevel(depth) },
      { label: 'Balance', tone: statusTone(balance), active: statusLevel(balance) === 3, level: statusLevel(balance) },
      { label: 'Consistent', tone: statusTone(consistency), active: statusLevel(consistency) === 3, level: statusLevel(consistency) },
      { label: tempo === 'Fair' ? 'Tempo Fast' : 'Tempo', tone: statusTone(tempo), active: statusLevel(tempo) === 3, level: statusLevel(tempo) },
    ],
  }
}
