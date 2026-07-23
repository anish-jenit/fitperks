import type { AIDemoSettings } from '../types'

type Props = {
  value: AIDemoSettings
  onChange: (value: AIDemoSettings) => void
  showApiNote?: boolean
}

const OPTIONS: Array<{ key: keyof AIDemoSettings; label: string; apiBacked: boolean }> = [
  { key: 'enableAIOverlay', label: 'Enable AI Overlay', apiBacked: false },
  { key: 'enableAILiveCoach', label: 'Enable AI Live Coach', apiBacked: true },
  { key: 'enableAIAnnouncer', label: 'Enable AI Announcer', apiBacked: true },
  { key: 'enableExecutiveSummary', label: 'Enable Executive Summary', apiBacked: true },
  { key: 'enableCelebrationAnimations', label: 'Enable Celebration Animations', apiBacked: false },
]

export function AIDemoSettings({ value, onChange, showApiNote = true }: Props) {
  return (
    <div className="admin-ai-settings">
      <div className="admin-ai-settings-heading">
        <h3 className="admin-subsection-title">AI Demo Settings</h3>
        {showApiNote ? <p className="hint">API-backed features default to off and run only when enabled by admin.</p> : null}
      </div>
      <div className="exercise-toggle-grid">
        {OPTIONS.map((option) => (
          <label className="exercise-toggle-card" key={option.key}>
            <input
              type="checkbox"
              checked={value[option.key]}
              onChange={(event) => onChange({ ...value, [option.key]: event.target.checked })}
            />
            <span>{option.label}{option.apiBacked ? ' (API)' : ''}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
