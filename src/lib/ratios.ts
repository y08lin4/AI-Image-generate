import type { AspectRatio, Ratio, ResolutionTier } from '../types'

export const RATIOS: AspectRatio[] = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']

export const RESOLUTION_TIERS: ResolutionTier[] = ['auto', 'standard', '2k', '4k']

export const FIXED_RATIOS: Ratio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']

export const RESOLUTION_LABEL: Record<ResolutionTier, string> = {
  auto: '自动',
  standard: '标准',
  '2k': '2K',
  '4k': '4K',
}

export const SIZE_MAP: Record<Exclude<ResolutionTier, 'auto'>, Record<Ratio, string>> = {
  standard: {
    '1:1': '1024x1024',
    '2:3': '1024x1536',
    '3:2': '1536x1024',
    '3:4': '768x1024',
    '4:3': '1024x768',
    '9:16': '1008x1792',
    '16:9': '1792x1008',
  },
  '2k': {
    '1:1': '2048x2048',
    '2:3': '1344x2016',
    '3:2': '2016x1344',
    '3:4': '1536x2048',
    '4:3': '2048x1536',
    '9:16': '1152x2048',
    '16:9': '2048x1152',
  },
  '4k': {
    '1:1': '2880x2880',
    '2:3': '2336x3504',
    '3:2': '3504x2336',
    '3:4': '2448x3264',
    '4:3': '3264x2448',
    '9:16': '2160x3840',
    '16:9': '3840x2160',
  },
}

export function isFixedRatio(ratio: AspectRatio): ratio is Ratio {
  return ratio !== 'auto'
}

export function isFixedResolution(resolution: ResolutionTier): resolution is Exclude<ResolutionTier, 'auto'> {
  return resolution !== 'auto'
}

export function getResolutionLabel(resolution: ResolutionTier) {
  return RESOLUTION_LABEL[resolution]
}

export function getImageSize(ratio: AspectRatio, resolution: ResolutionTier) {
  return isFixedRatio(ratio) && isFixedResolution(resolution) ? SIZE_MAP[resolution][ratio] : '自动'
}

export function getAvailableRatios(resolution: ResolutionTier): AspectRatio[] {
  return resolution === 'auto' ? ['auto'] : FIXED_RATIOS
}

export function normalizeRatioForResolution(ratio: AspectRatio, resolution: ResolutionTier): AspectRatio {
  const available = getAvailableRatios(resolution)
  return available.includes(ratio) ? ratio : available[0]
}

export function getRatioPreviewStyle(ratio: AspectRatio) {
  if (ratio === 'auto') {
    return {
      width: '18px',
      height: '18px',
    }
  }

  const [w, h] = ratio.split(':').map(Number)
  const maxW = 18
  const maxH = 18
  const scale = Math.min(maxW / w, maxH / h)
  return {
    width: `${Math.max(6, w * scale)}px`,
    height: `${Math.max(6, h * scale)}px`,
  }
}
