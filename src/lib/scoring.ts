import type { ExerciseType } from '../types'
import { POINTS_BY_EXERCISE } from './constants'

export function calculatePoints(exercise: ExerciseType, reps: number): number {
  return reps * POINTS_BY_EXERCISE[exercise]
}
