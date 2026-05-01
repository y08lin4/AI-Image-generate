import type { AspectRatio } from '../types'
import { RATIOS, getRatioPreviewStyle } from '../lib/ratios'

interface Props {
  value: AspectRatio
  onChange: (ratio: AspectRatio) => void
  ratios?: AspectRatio[]
}

export function RatioPicker({ value, onChange, ratios = RATIOS }: Props) {
  return (
    <div className="ratio-list" role="radiogroup" aria-label="图片比例">
      {ratios.map((ratio) => (
        <button
          key={ratio}
          type="button"
          className={`ratio-btn ${ratio === value ? 'active' : ''}`}
          onClick={() => onChange(ratio)}
          aria-checked={ratio === value}
          role="radio"
        >
          <span className="ratio-icon" style={getRatioPreviewStyle(ratio)} />
          <span>{ratio === 'auto' ? '自动' : ratio}</span>
        </button>
      ))}
    </div>
  )
}
