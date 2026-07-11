import { useCallback, useEffect, useState } from 'react'
import { getActiveChallenge, getIndividualLeaderboard, getTeamLeaderboard } from '../lib/supabaseApi'
import { hasSupabaseConfig, supabase, useFlowStubs } from '../lib/supabase'
import type { ChallengeRecord, IndividualLeaderboardRow, TeamLeaderboardRow } from '../types'

type LeaderboardState = {
  challenge: ChallengeRecord | null
  todayIndividual: IndividualLeaderboardRow[]
  overallIndividual: IndividualLeaderboardRow[]
  todayTeam: TeamLeaderboardRow[]
  overallTeam: TeamLeaderboardRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useLeaderboardData(organizationCode: string | null = null): LeaderboardState {
  const [challenge, setChallenge] = useState<ChallengeRecord | null>(null)
  const [todayIndividual, setTodayIndividual] = useState<IndividualLeaderboardRow[]>([])
  const [overallIndividual, setOverallIndividual] = useState<IndividualLeaderboardRow[]>([])
  const [todayTeam, setTodayTeam] = useState<TeamLeaderboardRow[]>([])
  const [overallTeam, setOverallTeam] = useState<TeamLeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!hasSupabaseConfig && !useFlowStubs) {
      setError('Supabase is not configured. Add environment variables to continue.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const activeChallenge = await getActiveChallenge(organizationCode ?? undefined)
      setChallenge(activeChallenge)

      if (!activeChallenge) {
        setTodayIndividual([])
        setOverallIndividual([])
        setTodayTeam([])
        setOverallTeam([])
        return
      }

      const [nextTodayIndividual, nextOverallIndividual, nextTodayTeam, nextOverallTeam] = await Promise.all([
        getIndividualLeaderboard(activeChallenge.id, 'today'),
        getIndividualLeaderboard(activeChallenge.id, 'overall'),
        getTeamLeaderboard(activeChallenge.id, 'today'),
        getTeamLeaderboard(activeChallenge.id, 'overall'),
      ])

      setTodayIndividual(nextTodayIndividual)
      setOverallIndividual(nextOverallIndividual)
      setTodayTeam(nextTodayTeam)
      setOverallTeam(nextOverallTeam)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch leaderboard data')
    } finally {
      setLoading(false)
    }
  }, [organizationCode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!hasSupabaseConfig || useFlowStubs) {
      return
    }

    const channel = supabase
      .channel(`fitperk-org-live-${organizationCode ?? 'default'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_transactions' }, () => {
        void refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participant_streaks' }, () => {
        void refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_streaks' }, () => {
        void refresh()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh, organizationCode])

  return {
    challenge,
    todayIndividual,
    overallIndividual,
    todayTeam,
    overallTeam,
    loading,
    error,
    refresh,
  }
}
