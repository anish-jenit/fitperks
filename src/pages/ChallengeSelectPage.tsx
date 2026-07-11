import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CHALLENGES } from '../lib/constants'
import { getActiveChallenge } from '../lib/supabaseApi'
import { hasSupabaseConfig } from '../lib/supabase'
import { getConfiguredOrganizationCode } from '../lib/storage'
import type { ChallengeRecord } from '../types'

const CTA_PHRASES = ['Let\'s Go', 'Start Now', 'Let\'s Move', 'Game On', 'Bring It On']
const CHALLENGE_VIDEO_SLUG: Record<'squat' | 'burpee', string> = {
  squat: 'squat',
  burpee: 'jumping-jacks',
}

function createRandomCtaLabels() {
  const shuffled = [...CTA_PHRASES]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }

  return {
    squat: shuffled[0] ?? 'Start',
    burpee: shuffled[1] ?? shuffled[0] ?? 'Start',
  }
}

function ChallengeMedia({ exerciseId }: { exerciseId: 'squat' | 'burpee' }) {
  const [showVideo, setShowVideo] = useState(true)
  const videoPath = `/challenge-videos/${CHALLENGE_VIDEO_SLUG[exerciseId]}/preview.mp4`

  if (!showVideo) {
    return <ChallengeDoodle exerciseId={exerciseId} />
  }

  return (
    <video
      className="challenge-video"
      autoPlay
      loop
      muted
      playsInline
      onError={() => {
        setShowVideo(false)
      }}
    >
      <source src={videoPath} type="video/mp4" />
    </video>
  )
}

function ChallengeDoodle({ exerciseId }: { exerciseId: 'squat' | 'burpee' }) {
  if (exerciseId === 'squat') {
    return (
      <div className="challenge-doodle" aria-hidden="true">
        <svg viewBox="0 0 220 120" role="img">
          <rect x="0" y="0" width="220" height="120" rx="18" className="doodle-bg" />
          <line x1="20" y1="100" x2="200" y2="100" className="doodle-ground" />
          <g className="doodle-figure">
            <g className="squat-body">
              <rect x="100" y="18" width="20" height="16" rx="4" className="robot-head-shell" />
              <rect x="104" y="24" width="12" height="6" rx="2" className="robot-visor" />
              <rect x="97" y="40" width="26" height="24" rx="6" className="robot-torso" />
              <rect x="104" y="46" width="12" height="4" rx="2" className="robot-core" />
              <rect x="107" y="64" width="6" height="8" rx="2" className="robot-pelvis" />
            </g>
            <line x1="100" y1="51" x2="84" y2="63" className="doodle-line squat-arm-left" />
            <line x1="120" y1="51" x2="136" y2="63" className="doodle-line squat-arm-right" />

            <line x1="108" y1="70" x2="96" y2="100" className="doodle-line squat-leg-left" />
            <line x1="112" y1="70" x2="124" y2="100" className="doodle-line squat-leg-right" />
          </g>
        </svg>
      </div>
    )
  }

  return (
    <div className="challenge-doodle" aria-hidden="true">
      <svg viewBox="0 0 220 120" role="img">
        <rect x="0" y="0" width="220" height="120" rx="18" className="doodle-bg" />
        <line x1="20" y1="100" x2="200" y2="100" className="doodle-ground" />
        <g className="doodle-figure">
          <g className="jj-body">
            <rect x="100" y="17" width="20" height="16" rx="4" className="robot-head-shell" />
            <rect x="104" y="23" width="12" height="6" rx="2" className="robot-visor" />
            <rect x="97" y="39" width="26" height="24" rx="6" className="robot-torso" />
            <rect x="104" y="45" width="12" height="4" rx="2" className="robot-core" />
            <rect x="107" y="63" width="6" height="8" rx="2" className="robot-pelvis" />
          </g>
          <line x1="100" y1="51" x2="97" y2="78" className="doodle-line jj-arm-left" />
          <line x1="120" y1="51" x2="123" y2="78" className="doodle-line jj-arm-right" />
          <line x1="108" y1="70" x2="104" y2="100" className="doodle-line jj-leg-left" />
          <line x1="112" y1="70" x2="116" y2="100" className="doodle-line jj-leg-right" />
        </g>
      </svg>
    </div>
  )
}

export function ChallengeSelectPage() {
  const [activeChallenge, setActiveChallenge] = useState<ChallengeRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ctaLabelByChallenge] = useState(() => createRandomCtaLabels())
  const orgCode = getConfiguredOrganizationCode()?.trim().toUpperCase()

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setActiveChallenge({
        id: 'demo-challenge',
        organization_id: 'demo-org',
        name: 'Demo Challenge Window',
        description: 'Local camera test mode',
        start_date: dayjs().subtract(1, 'day').toISOString(),
        end_date: dayjs().add(7, 'day').toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        status: 'active',
        squat_points_per_rep: 1,
        burpee_points_per_rep: 2,
        daily_streak_bonus: 0,
        team_streak_bonus: 0,
        max_sessions_per_day: 5,
        enabled_squat: true,
        enabled_burpee: true,
        qualifying_threshold_type: 'total_points',
        qualifying_threshold_value: 10,
        team_qualification_type: 'fixed_count',
        team_required_unique_members: 3,
        team_required_participation_percent: 25,
        created_at: dayjs().toISOString(),
      })
      return
    }

    if (!orgCode) {
      setError('Organization code is missing. Complete participant registration to continue.')
      return
    }

    void getActiveChallenge(orgCode)
      .then(setActiveChallenge)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load active challenge')
      })
  }, [orgCode])

  return (
    <main className="page">
      <section className="panel challenge-select-panel">
        <h1>Choose a Challenge</h1>
        {activeChallenge ? (
          <p>
            {dayjs(activeChallenge.start_date).format('MMM D, YYYY HH:mm')} to{' '}
            {dayjs(activeChallenge.end_date).format('MMM D, YYYY HH:mm')} ({activeChallenge.timezone})
          </p>
        ) : (
          <p>-</p>
        )}
        {error ? <p className="error">{error}</p> : null}
        <div className="challenge-grid">
          {CHALLENGES.map((challenge) => (
            <article className="challenge-card" key={challenge.id}>
              <ChallengeMedia exerciseId={challenge.id} />
              <h2>{challenge.name}</h2>
              {activeChallenge && ((challenge.id === 'squat' && activeChallenge.enabled_squat) || (challenge.id === 'burpee' && activeChallenge.enabled_burpee)) ? (
                <Link className="button primary" to={`/workout/${challenge.id}`}>
                  {ctaLabelByChallenge[challenge.id]}
                </Link>
              ) : (
                <button className="button ghost" disabled>
                  {ctaLabelByChallenge[challenge.id]}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
