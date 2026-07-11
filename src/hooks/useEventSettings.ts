import { useCallback, useEffect, useState } from 'react'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
import { getActiveChallenge, getOrCreateEventSettings } from '../lib/supabaseApi'
import { DEFAULT_APP_SETTINGS, FIXED_WORKOUT_DURATION_SECONDS, type AppSettings } from '../lib/settings'

export function useEventSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setError('Supabase is not configured. Add environment variables to continue.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [next, challenge] = await Promise.all([getOrCreateEventSettings(), getActiveChallenge()])

      const resolvedSettings: AppSettings = {
        ...next,
        sessionDurationSeconds: FIXED_WORKOUT_DURATION_SECONDS,
        id: challenge?.id ?? next.id,
        enabledChallenges: {
          squat: challenge?.enabled_squat ?? next.enabledChallenges.squat,
          burpee: challenge?.enabled_burpee ?? next.enabledChallenges.burpee,
          'high-knees': challenge?.enabled_high_knees ?? next.enabledChallenges['high-knees'],
          lunges: challenge?.enabled_lunges ?? next.enabledChallenges.lunges,
        },
      }

      setSettings(resolvedSettings)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return
    }

    const channel = supabase
      .channel('fitperk-settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, () => {
        void refresh()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh])

  return {
    settings,
    loading,
    error,
    refresh,
  }
}
