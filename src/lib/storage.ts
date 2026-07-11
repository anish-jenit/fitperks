import type { ParticipantProfile } from '../types'
import { KIOSK_ORG_CODE_STORAGE_KEY, PARTICIPANT_STORAGE_KEY } from './constants'

export function saveParticipantProfile(profile: ParticipantProfile): void {
  localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(profile))
}

export function getParticipantProfile(): ParticipantProfile | null {
  const raw = localStorage.getItem(PARTICIPANT_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as ParticipantProfile
  } catch {
    return null
  }
}

export function clearParticipantProfile(): void {
  localStorage.removeItem(PARTICIPANT_STORAGE_KEY)
}

export function getConfiguredOrganizationCode(): string | null {
  const envCode = import.meta.env.VITE_DEFAULT_ORG_CODE as string | undefined
  if (envCode && envCode.trim()) {
    return envCode.trim()
  }

  const stored = localStorage.getItem(KIOSK_ORG_CODE_STORAGE_KEY)
  if (!stored) {
    const participant = getParticipantProfile()
    const participantOrgCode = participant?.organizationCode?.trim()
    return participantOrgCode || null
  }

  return stored.trim() || null
}

export function setConfiguredOrganizationCode(code: string): void {
  localStorage.setItem(KIOSK_ORG_CODE_STORAGE_KEY, code.trim())
}
