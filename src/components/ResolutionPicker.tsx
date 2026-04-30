import type { ResolutionTier } from '../types'
import { getResolutionLabel, RESOLUTION_TIERS } from '../lib/ratios'

interface Props {
  value: ResolutionTier
  onChange: (resolution: ResolutionTier) => void
}

export function ResolutionPicker({ value, onChange }: Props) {
  return (
    <div className="resolution-list" role="radiogroup" aria-label="分辨率档位">
      {RESOLUTION_TIERS.map((resolution) => (
        <button
          key={resolution}
          type="button"
          className={`resolution-btn ${resolution === value ? 'active' : ''}`}
          onClick={() => onChange(resolution)}
          aria-checked={resolution === value}
          role="radio"
        >
          {getResolutionLabel(resolution)}
        </button>
      ))}
    </div>
  )
}
