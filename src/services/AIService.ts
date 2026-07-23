import { buildLiveCoachPrompt, type LiveCoachPromptPayload } from './PromptService'

const responseCache = new Map<string, string>()
const recentResponses: string[] = []

function fallbackResponse(payload: LiveCoachPromptPayload): string {
  if (payload.depth === 'Excellent' || payload.depth === 'Good') return 'Great depth. Maintain your pace.'
  if (payload.tempo === 'Excellent' || payload.tempo === 'Good') return 'Excellent consistency. Keep the same rhythm.'
  if (payload.balance === 'Excellent' || payload.balance === 'Good') return 'Strong movement. Finish confidently.'
  return 'Good focus. Keep each movement controlled.'
}

function remember(response: string): string {
  recentResponses.push(response)
  if (recentResponses.length > 5) recentResponses.shift()
  return response
}

export async function generateLiveCoachSentence(payload: LiveCoachPromptPayload, enabled: boolean): Promise<string | null> {
  if (!enabled) return null

  const key = JSON.stringify(payload)
  const cached = responseCache.get(key)
  if (cached && !recentResponses.includes(cached)) return remember(cached)

  const endpoint = import.meta.env.VITE_AI_COACH_ENDPOINT as string | undefined
  if (!endpoint) {
    const fallback = fallbackResponse(payload)
    responseCache.set(key, fallback)
    return remember(fallback)
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: buildLiveCoachPrompt(payload), payload }),
  })

  if (!response.ok) throw new Error('Live coach request failed.')
  const data = await response.json() as { sentence?: string }
  const sentence = (data.sentence ?? fallbackResponse(payload)).trim().split(/\s+/).slice(0, 12).join(' ')
  responseCache.set(key, sentence)
  return remember(sentence)
}
