import type { MovementQuality } from '../services/MovementAnalysisService'

type Props = {
  quality: MovementQuality
  liveCoachMessage?: string | null
  liveCoachEnabled: boolean
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 55) return 'Steady'
  return 'Warming Up'
}

export function AILivePanel({ quality, liveCoachMessage, liveCoachEnabled }: Props) {
  return (
    <aside className="ai-live-panel" aria-label="FitPerks AI live analysis">
      <div className="ai-live-panel-heading">
        <div>
          <span className="ai-panel-kicker">Movement intelligence</span>
          <h2>FitPerks AI</h2>
        </div>
        <span className={`ai-score-pill ai-score-${quality.movementScore >= 75 ? 'good' : 'warn'}`}>
          {quality.movementScore}/100 · {scoreLabel(quality.movementScore)}
        </span>
      </div>
      <div className="ai-score-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(3, quality.movementScore)}%` }} />
      </div>
      <div className="ai-status-list" aria-label="Movement checks">
        {quality.statusItems.map((item) => (
          <span className={`ai-status-item ai-status-${item.tone} ai-status-level-${item.level}`} key={item.label}>
            <span className="ai-traffic-light" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>{item.label}</strong>
          </span>
        ))}
      </div>
      <p className="ai-coaching-hint">{liveCoachMessage || quality.coachingHint}</p>
      {liveCoachEnabled ? <p className="ai-live-footnote">Live Coach updates at key moments.</p> : null}
    </aside>
  )
}
