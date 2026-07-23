import type { MovementQuality } from './MovementAnalysisService'

export type LiveCoachPromptPayload = {
  exercise: string
  movementScore: number
  repAccuracy: string
  tempo: string
  depth: string
  balance: string
  consistency: string
}

export function buildLiveCoachPayload(exercise: string, quality: MovementQuality): LiveCoachPromptPayload {
  return {
    exercise,
    movementScore: quality.movementScore,
    repAccuracy: quality.repAccuracy,
    tempo: quality.tempo,
    depth: quality.squatDepth,
    balance: quality.balance,
    consistency: quality.consistency,
  }
}

export function buildLiveCoachPrompt(payload: LiveCoachPromptPayload): string {
  return [
    'Generate ONE encouraging sentence.',
    'Maximum 12 words.',
    'Professional. Corporate friendly.',
    'Never mention scores. Never mention confidence. Never use emojis.',
    JSON.stringify(payload),
  ].join(' ')
}
