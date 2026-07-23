type Props = {
  enabled: boolean
  onGenerate?: () => void
  summary?: string | null
  busy?: boolean
}

export function ExecutiveSummary({ enabled, onGenerate, summary, busy }: Props) {
  if (!enabled) return null

  return (
    <section className="executive-summary">
      <div>
        <span className="ai-panel-kicker">Executive Summary</span>
        {summary ? <p>{summary}</p> : null}
      </div>
      <button className="button ghost" type="button" onClick={onGenerate} disabled={busy}>
        {busy ? 'Generating...' : 'Generate Executive Insights'}
      </button>
    </section>
  )
}
