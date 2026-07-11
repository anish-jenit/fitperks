export function CommuteWorkoutAnime() {
  return (
    <div className="commute-anime" aria-hidden="true">
      <svg viewBox="0 0 760 300" role="img">
        <title>Stickman commute workout animation</title>
        <rect x="0" y="0" width="760" height="300" rx="24" className="anime-bg" />

        <g className="city-silhouette">
          <rect x="510" y="72" width="130" height="130" rx="6" />
          <rect x="648" y="92" width="82" height="110" rx="6" />
          <rect x="28" y="116" width="130" height="86" rx="8" />
          <polygon points="93,70 28,116 158,116" />
          <rect x="558" y="146" width="26" height="56" rx="4" className="office-door" />
          <rect x="468" y="164" width="16" height="38" rx="3" className="workout-device" />
          <rect x="462" y="154" width="28" height="14" rx="3" className="workout-screen" />
        </g>

        <line x1="24" y1="224" x2="736" y2="224" className="commute-lane" />
        <line x1="24" y1="244" x2="736" y2="244" className="commute-ground" />

        <g className="stickman-commute">
          <g className="stickman-exercise">
            <circle cx="80" cy="152" r="12" className="stick-head" />
            <line x1="80" y1="164" x2="80" y2="198" className="stick-part torso" />
            <line x1="80" y1="176" x2="58" y2="188" className="stick-part arm-left" />
            <line x1="80" y1="176" x2="102" y2="188" className="stick-part arm-right" />
            <line x1="80" y1="198" x2="62" y2="224" className="stick-part leg-left" />
            <line x1="80" y1="198" x2="98" y2="224" className="stick-part leg-right" />
          </g>
        </g>
      </svg>
    </div>
  )
}
