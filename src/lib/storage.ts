import type { ParticipantProfile } from '../types'
import {
  GUEST_CREATOR_KEY_STORAGE_KEY,
  GUEST_JOIN_CODE_STORAGE_KEY,
  GUEST_JOIN_EMAIL_STORAGE_KEY,
  GUEST_JOIN_NAME_STORAGE_KEY,
  KIOSK_ORG_CODE_STORAGE_KEY,
  PARTICIPANT_STORAGE_KEY,
} from './constants'

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

export function getOrCreateGuestCreatorKey(): string {
  const stored = localStorage.getItem(GUEST_CREATOR_KEY_STORAGE_KEY)
  if (stored?.trim()) {
    return stored.trim()
  }

  const key = crypto.randomUUID()
  localStorage.setItem(GUEST_CREATOR_KEY_STORAGE_KEY, key)
  return key
}

export function saveGuestJoinContext(input: { guestName: string; guestEmail?: string; challengeCode: string }): void {
  localStorage.setItem(GUEST_JOIN_NAME_STORAGE_KEY, input.guestName.trim())
  if (input.guestEmail) {
    localStorage.setItem(GUEST_JOIN_EMAIL_STORAGE_KEY, input.guestEmail.trim().toLowerCase())
  }
  localStorage.setItem(GUEST_JOIN_CODE_STORAGE_KEY, input.challengeCode.trim().toLowerCase())
}

export function getLastGuestName(): string {
  return localStorage.getItem(GUEST_JOIN_NAME_STORAGE_KEY)?.trim() ?? ''
}

export function getLastGuestChallengeCode(): string {
  return localStorage.getItem(GUEST_JOIN_CODE_STORAGE_KEY)?.trim() ?? ''
}

export function getLastGuestEmail(): string {
  return localStorage.getItem(GUEST_JOIN_EMAIL_STORAGE_KEY)?.trim().toLowerCase() ?? ''
}
