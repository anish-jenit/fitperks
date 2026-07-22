import type { NormalizedLandmark } from '@mediapipe/pose'
import type { CalibrationSettings } from './settings'

export type PoseState = {
  isStanding: boolean
  isSquatDepth: boolean
  isHandsDown: boolean
  isPlank: boolean
  isJumpingJackOpen: boolean
  isJumpingJackClosed: boolean
  isHighKneeRaised: boolean
  isHighKneeLowered: boolean
  isLungeDepth: boolean
}

function angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const abX = a.x - b.x
  const abY = a.y - b.y
  const cbX = c.x - b.x
  const cbY = c.y - b.y

  const dot = abX * cbX + abY * cbY
  const magAB = Math.hypot(abX, abY)
  const magCB = Math.hypot(cbX, cbY)

  if (magAB === 0 || magCB === 0) {
    return 180
  }

  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)))
  return (Math.acos(cosine) * 180) / Math.PI
}

export function analyzePose(landmarks: NormalizedLandmark[], calibration: CalibrationSettings): PoseState {
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  const leftHip = landmarks[23]
  const rightHip = landmarks[24]
  const leftKnee = landmarks[25]
  const rightKnee = landmarks[26]
  const leftAnkle = landmarks[27]
  const rightAnkle = landmarks[28]
  const leftWrist = landmarks[15]
  const rightWrist = landmarks[16]

  const leftKneeAngle = angle(leftHip, leftKnee, leftAnkle)
  const rightKneeAngle = angle(rightHip, rightKnee, rightAnkle)
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2

  const leftHipAngle = angle(leftShoulder, leftHip, leftKnee)
  const rightHipAngle = angle(rightShoulder, rightHip, rightKnee)
  const avgHipAngle = (leftHipAngle + rightHipAngle) / 2

  const avgHipY = (leftHip.y + rightHip.y) / 2
  const avgKneeY = (leftKnee.y + rightKnee.y) / 2
  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2
  const avgWristY = (leftWrist.y + rightWrist.y) / 2
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x)
  const ankleWidth = Math.abs(leftAnkle.x - rightAnkle.x)

  const hipHeightFromKnee = avgKneeY - avgHipY
  const shoulderHipDelta = Math.abs(avgShoulderY - avgHipY)

  const isStanding =
    avgKneeAngle > calibration.squat.standingKneeMin &&
    avgHipAngle > calibration.squat.standingHipMin &&
    hipHeightFromKnee > 0.12
  const isSquatDepth =
    avgKneeAngle < calibration.squat.squatKneeMax &&
    hipHeightFromKnee < calibration.squat.squatHipDropMax
  const isHandsDown = avgHipAngle < calibration.burpee.handsDownHipMax && avgWristY > avgKneeY - 0.02
  const isPlank =
    avgHipAngle > calibration.burpee.plankHipMin &&
    shoulderHipDelta < calibration.burpee.plankShoulderHipMax
  const bothHandsAboveHead =
    leftWrist.y < avgShoulderY - 0.12 &&
    rightWrist.y < avgShoulderY - 0.12
  const bothHandsDown =
    leftWrist.y > avgShoulderY + 0.02 &&
    rightWrist.y > avgShoulderY + 0.02
  const isJumpingJackOpen = bothHandsAboveHead && ankleWidth > shoulderWidth * 1.5
  const isJumpingJackClosed = bothHandsDown && ankleWidth < shoulderWidth * 0.85 && isStanding
  const leftKneeRaised = leftKnee.y < avgHipY + 0.12 && rightKneeAngle > 130
  const rightKneeRaised = rightKnee.y < avgHipY + 0.12 && leftKneeAngle > 130
  const isHighKneeRaised = leftKneeRaised || rightKneeRaised
  const isHighKneeLowered =
    leftKnee.y > avgHipY + 0.04 &&
    rightKnee.y > avgHipY + 0.04 &&
    avgKneeAngle > 130 &&
    avgHipAngle > 140
  const oneLegBent = Math.min(leftKneeAngle, rightKneeAngle) < 130
  const otherLegStable = Math.max(leftKneeAngle, rightKneeAngle) > 125
  const kneesSeparated = Math.abs(leftKnee.x - rightKnee.x) > shoulderWidth * 0.18
  const isLungeDepth = oneLegBent && otherLegStable && kneesSeparated && avgHipY > avgShoulderY + 0.18

  return {
    isStanding,
    isSquatDepth,
    isHandsDown,
    isPlank,
    isJumpingJackOpen,
    isJumpingJackClosed,
    isHighKneeRaised,
    isHighKneeLowered,
    isLungeDepth,
  }
}
