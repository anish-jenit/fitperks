import type { ExerciseType } from '../types'

export type SquatCalibration = {
  standingKneeMin: number
  standingHipMin: number
  squatKneeMax: number
  squatHipDropMax: number
}

export type BurpeeCalibration = {
  handsDownHipMax: number
  plankHipMin: number
  plankShoulderHipMax: number
}

export type CalibrationSettings = {
  squat: SquatCalibration
  burpee: BurpeeCalibration
}

export type AppSettings = {
  id: string
  sessionDurationSeconds: number
  enabledChallenges: Record<ExerciseType, boolean>
  calibration: CalibrationSettings
  updatedAt?: string
}

export type AppSettingsFieldErrors = Partial<Record<string, string>>

export const FIXED_WORKOUT_DURATION_SECONDS = 60

export const DEFAULT_CALIBRATION: CalibrationSettings = {
  squat: {
    standingKneeMin: 150,
    standingHipMin: 140,
    squatKneeMax: 145,
    squatHipDropMax: 0.2,
  },
  burpee: {
    handsDownHipMax: 120,
    plankHipMin: 155,
    plankShoulderHipMax: 0.18,
  },
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'default',
  sessionDurationSeconds: FIXED_WORKOUT_DURATION_SECONDS,
  enabledChallenges: {
    squat: true,
    burpee: true,
    'high-knees': true,
    lunges: true,
  },
  calibration: DEFAULT_CALIBRATION,
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max
}

export function validateAppSettings(settings: AppSettings): string[] {
  const errors: string[] = []

  if (!inRange(settings.sessionDurationSeconds, 15, 300)) {
    errors.push('Session duration must be between 15 and 300 seconds.')
  }

  if (!Object.values(settings.enabledChallenges).some(Boolean)) {
    errors.push('At least one challenge must remain enabled.')
  }

  if (!inRange(settings.calibration.squat.standingKneeMin, 120, 180)) {
    errors.push('Squat standing knee min angle must be between 120 and 180.')
  }

  if (!inRange(settings.calibration.squat.standingHipMin, 120, 180)) {
    errors.push('Squat standing hip min angle must be between 120 and 180.')
  }

  if (!inRange(settings.calibration.squat.squatKneeMax, 60, 150)) {
    errors.push('Squat knee max angle must be between 60 and 150.')
  }

  if (!inRange(settings.calibration.squat.squatHipDropMax, 0.01, 0.35)) {
    errors.push('Squat hip drop max must be between 0.01 and 0.35.')
  }

  if (settings.calibration.squat.squatKneeMax >= settings.calibration.squat.standingKneeMin) {
    errors.push('Squat knee max angle must be lower than squat standing knee min angle.')
  }

  if (!inRange(settings.calibration.burpee.handsDownHipMax, 70, 160)) {
    errors.push('Burpee hands down hip max angle must be between 70 and 160.')
  }

  if (!inRange(settings.calibration.burpee.plankHipMin, 120, 180)) {
    errors.push('Burpee plank hip min angle must be between 120 and 180.')
  }

  if (!inRange(settings.calibration.burpee.plankShoulderHipMax, 0.05, 0.4)) {
    errors.push('Burpee plank shoulder-hip max delta must be between 0.05 and 0.4.')
  }

  if (settings.calibration.burpee.handsDownHipMax >= settings.calibration.burpee.plankHipMin) {
    errors.push('Burpee hands down hip max angle must be lower than burpee plank hip min angle.')
  }

  return errors
}

export function validateAppSettingsByField(settings: AppSettings): AppSettingsFieldErrors {
  const errors: AppSettingsFieldErrors = {}

  if (!inRange(settings.sessionDurationSeconds, 15, 300)) {
    errors.sessionDurationSeconds = 'Use 15 to 300 seconds.'
  }

  if (!Object.values(settings.enabledChallenges).some(Boolean)) {
    errors.enabledChallenges = 'At least one challenge must stay enabled.'
  }

  if (!inRange(settings.calibration.squat.standingKneeMin, 120, 180)) {
    errors['squat.standingKneeMin'] = 'Use 120 to 180.'
  }

  if (!inRange(settings.calibration.squat.standingHipMin, 120, 180)) {
    errors['squat.standingHipMin'] = 'Use 120 to 180.'
  }

  if (!inRange(settings.calibration.squat.squatKneeMax, 60, 150)) {
    errors['squat.squatKneeMax'] = 'Use 60 to 150.'
  }

  if (!inRange(settings.calibration.squat.squatHipDropMax, 0.01, 0.35)) {
    errors['squat.squatHipDropMax'] = 'Use 0.01 to 0.35.'
  }

  if (settings.calibration.squat.squatKneeMax >= settings.calibration.squat.standingKneeMin) {
    errors['squat.squatKneeMax'] = 'Must be lower than standing knee min.'
  }

  if (!inRange(settings.calibration.burpee.handsDownHipMax, 70, 160)) {
    errors['burpee.handsDownHipMax'] = 'Use 70 to 160.'
  }

  if (!inRange(settings.calibration.burpee.plankHipMin, 120, 180)) {
    errors['burpee.plankHipMin'] = 'Use 120 to 180.'
  }

  if (!inRange(settings.calibration.burpee.plankShoulderHipMax, 0.05, 0.4)) {
    errors['burpee.plankShoulderHipMax'] = 'Use 0.05 to 0.4.'
  }

  if (settings.calibration.burpee.handsDownHipMax >= settings.calibration.burpee.plankHipMin) {
    errors['burpee.handsDownHipMax'] = 'Must be lower than plank hip min.'
  }

  return errors
}
