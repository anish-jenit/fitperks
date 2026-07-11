import type { ChallengeConfig, ExerciseType } from '../types'

export const CHALLENGES: ChallengeConfig[] = [
  {
    id: 'squat',
    name: 'Squat Challenge',
    pointsPerRep: 1,
    description: 'Hold your chest up, squat until your hips drop below standing height, then return fully upright.',
  },
  {
    id: 'burpee',
    name: 'Jumping Jack Challenge',
    pointsPerRep: 2,
    description: 'Jump feet out while raising arms overhead, then return to closed stance to complete a rep.',
  },
]

export const POINTS_BY_EXERCISE: Record<ExerciseType, number> = {
  squat: 1,
  burpee: 2,
}

export const SESSION_DURATION_SECONDS = 60

export const PARTICIPANT_STORAGE_KEY = 'fitperk-participant'
export const KIOSK_ORG_CODE_STORAGE_KEY = 'fitperk-kiosk-org-code'
