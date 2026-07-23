import type { MovementQuality } from '../services/MovementAnalysisService'
import { MovementQualityCard } from './MovementQualityCard'

type Props = {
  quality: MovementQuality
  liveCoachMessage?: string | null
  liveCoachEnabled: boolean
}

export function AILivePanel({ quality, liveCoachMessage, liveCoachEnabled }: Props) {
  return (
    <aside className="ai-live-panel" aria-label="FitPerks AI live analysis">
      <div className="ai-live-panel-heading">
        <div>
          <span className="ai-panel-kicker">FitPerks AI</span>
          <h2>Live Analysis</h2>
        </div>
        <span className="ai-live-badge">Rule Engine</span>
      </div>
      <div className="ai-status-list">
        {quality.statusItems.map((item) => (
          <div className={`ai-status-item ai-status-${item.tone}`} key={item.label}>
            <span aria-hidden="true">{item.active ? '●' : '○'}</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </div>
      <MovementQualityCard quality={quality} />
      <p className="ai-coaching-hint">{liveCoachMessage || quality.coachingHint}</p>
      {liveCoachEnabled ? <p className="ai-live-footnote">Live Coach updates every 5 valid reps or at completion.</p> : null}
    </aside>
  )
}
