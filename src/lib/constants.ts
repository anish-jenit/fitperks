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
  {
    id: 'high-knees',
    name: 'High Knees Challenge',
    pointsPerRep: 1,
    description: 'Drive one knee up toward hip height, reset, then alternate sides with quick control.',
  },
  {
    id: 'lunges',
    name: 'Lunge Challenge',
    pointsPerRep: 2,
    description: 'Step into a lunge until the front knee bends clearly, then stand tall before the next rep.',
  },
]

export const POINTS_BY_EXERCISE: Record<ExerciseType, number> = {
  squat: 1,
  burpee: 2,
  'high-knees': 1,
  lunges: 2,
}

export const CHALLENGE_VIDEO_PATH: Record<ExerciseType, string> = {
  squat: '/challenge-videos/squat/fitperks_squat.mp4?v=2026-07-23-squat',
  burpee: '/challenge-videos/jumping-jacks/fitperks_jumpingjacks.mp4',
  'high-knees': '/challenge-videos/high-knees/fitperks_highknees.mp4',
  lunges: '/challenge-videos/lunges/fitperks_lunges.mp4',
}

export const SESSION_DURATION_SECONDS = 60

export const PARTICIPANT_STORAGE_KEY = 'fitperk-participant'
export const KIOSK_ORG_CODE_STORAGE_KEY = 'fitperk-kiosk-org-code'
export const GUEST_CREATOR_KEY_STORAGE_KEY = 'fitperk-guest-creator-key'
export const GUEST_JOIN_NAME_STORAGE_KEY = 'fitperk-guest-join-name'
export const GUEST_JOIN_EMAIL_STORAGE_KEY = 'fitperk-guest-join-email'
export const GUEST_JOIN_CODE_STORAGE_KEY = 'fitperk-guest-join-code'
