import type { MovementQuality } from '../services/MovementAnalysisService'

type Props = {
  quality: MovementQuality
}

function ratingLabel(score: number): string {
  if (score >= 95) return 'Excellent'
  if (score >= 80) return 'Strong'
  if (score >= 65) return 'Building'
  return 'Warming Up'
}

function stars(score: number): string {
  if (score >= 95) return '★★★★★'
  if (score >= 80) return '★★★★☆'
  if (score >= 65) return '★★★☆☆'
  return '★★☆☆☆'
}

export function MovementQualityCard({ quality }: Props) {
  return (
    <div className="movement-quality-card">
      <span className="ai-panel-kicker">Movement Intelligence</span>
      <div className="movement-quality-score">
        <strong>{quality.movementScore}</strong>
        <span>/100</span>
      </div>
      <p className="movement-quality-rating">{ratingLabel(quality.movementScore)}</p>
      <p className="movement-quality-stars" aria-label={`${stars(quality.movementScore)} movement rating`}>{stars(quality.movementScore)}</p>
      <dl className="movement-quality-metrics">
        <div><dt>Accuracy</dt><dd>{quality.repAccuracy}</dd></div>
        <div><dt>Depth</dt><dd>{quality.squatDepth}</dd></div>
        <div><dt>Tempo</dt><dd>{quality.tempo}</dd></div>
        <div><dt>Balance</dt><dd>{quality.balance}</dd></div>
      </dl>
    </div>
  )
}
