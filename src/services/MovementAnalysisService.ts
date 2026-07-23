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
  statusItems: Array<{ label: string; tone: 'good' | 'warn' | 'bad'; active: boolean }>
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
    { label: 'Rep Detected', tone: 'warn', active: false },
    { label: 'Good Depth', tone: 'warn', active: false },
    { label: 'Stable Balance', tone: 'warn', active: false },
    { label: 'Consistent Movement', tone: 'warn', active: false },
    { label: 'Controlled Tempo', tone: 'warn', active: false },
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

function squatDepthRating(kneeAngle: number, exercise: ExerciseType | 'plank'): QualityRating {
  if (exercise !== 'squat') return 'Good'
  if (kneeAngle >= 80 && kneeAngle <= 100) return 'Excellent'
  if (kneeAngle > 100 && kneeAngle <= 115) return 'Good'
  if (kneeAngle > 115 && kneeAngle <= 130) return 'Fair'
  return 'Poor'
}

function tempoRating(repHistory: RepHistoryEntry[]): QualityRating {
  const intervals = repHistory.map((entry) => entry.intervalMs).filter((value): value is number => typeof value === 'number')
  if (intervals.length === 0) return 'Good'
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

function hintFor(input: { depth: QualityRating; tempo: QualityRating; consistency: QualityRating; balance: QualityRating }): string {
  if (input.depth === 'Fair' || input.depth === 'Poor' || input.depth === 'Needs Improvement') return 'Maintain the same depth.'
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
  const depth = squatDepthRating((leftKneeAngle + rightKneeAngle) / 2, input.exercise)
  const tempo = tempoRating(input.repHistory)
  const consistency = consistencyRating(input.repHistory)
  const balance = balanceRating(input.landmarks)
  const movementScore = Math.round(
    accuracyScore * 0.4 +
    scoreFromRating(depth) * 0.2 +
    scoreFromRating(tempo) * 0.15 +
    scoreFromRating(consistency) * 0.15 +
    scoreFromRating(balance) * 0.1,
  )

  return {
    movementScore,
    repAccuracy,
    squatDepth: depth,
    tempo,
    consistency,
    balance,
    coachingHint: hintFor({ depth, tempo, consistency, balance }),
    statusItems: [
      { label: 'Rep Detected', tone: input.validReps > 0 ? 'good' : 'warn', active: input.validReps > 0 },
      { label: input.exercise === 'squat' ? 'Good Depth' : 'Clean Range', tone: depth === 'Excellent' || depth === 'Good' ? 'good' : 'warn', active: depth === 'Excellent' || depth === 'Good' },
      { label: 'Stable Balance', tone: balance === 'Excellent' || balance === 'Good' ? 'good' : 'warn', active: balance === 'Excellent' || balance === 'Good' },
      { label: 'Consistent Movement', tone: consistency === 'Excellent' || consistency === 'Good' ? 'good' : 'warn', active: consistency === 'Excellent' || consistency === 'Good' },
      { label: tempo === 'Fair' ? 'Slightly Fast Tempo' : 'Controlled Tempo', tone: tempo === 'Excellent' || tempo === 'Good' ? 'good' : 'warn', active: tempo === 'Excellent' || tempo === 'Good' },
    ],
  }
}
