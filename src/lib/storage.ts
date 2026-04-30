import type { AppSettings, AspectRatio, ResolutionTier } from '../types'

const SETTINGS_KEY = 'ai-image-generate:settings:v1'
const SESSION_SETTINGS_KEY = 'ai-image-generate:session-settings:v1'

export const DEFAULT_SETTINGS: AppSettings = {
  requestMode: 'worker',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  accessPassword: '',
  model: 'gpt-image-2',
  timeoutSec: 420,
  count: 1,
  concurrency: 2,
  defaultRatio: 'auto',
  defaultResolution: 'standard',
  rememberSecrets: true,
}

function normalizeRatio(value: unknown): AspectRatio {
  return value === 'auto' || value === '1:1' || value === '2:3' || value === '3:2' || value === '3:4' || value === '4:3' || value === '9:16' || value === '16:9'
    ? value
    : DEFAULT_SETTINGS.defaultRatio
}

function normalizeResolution(value: unknown): ResolutionTier {
  return value === 'auto' || value === 'standard' || value === '2k' || value === '4k'
    ? value
    : DEFAULT_SETTINGS.defaultResolution
}

function sanitizeSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    requestMode: raw.requestMode === 'direct' ? 'direct' : DEFAULT_SETTINGS.requestMode,
    timeoutSec: clampNumber(raw.timeoutSec, DEFAULT_SETTINGS.timeoutSec, 10, 900),
    count: clampNumber(raw.count, DEFAULT_SETTINGS.count, 1, 12),
    concurrency: clampNumber(raw.concurrency, DEFAULT_SETTINGS.concurrency, 1, 6),
    defaultRatio: normalizeRatio(raw.defaultRatio),
    defaultResolution: normalizeResolution(raw.defaultResolution),
    rememberSecrets: raw.rememberSecrets !== false,
  }
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const session = sessionStorage.getItem(SESSION_SETTINGS_KEY)
    if (session) return sanitizeSettings(JSON.parse(session))

    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return DEFAULT_SETTINGS
    return sanitizeSettings(JSON.parse(saved))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return
  const normalized = sanitizeSettings(settings)
  if (normalized.rememberSecrets) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized))
    sessionStorage.removeItem(SESSION_SETTINGS_KEY)
  } else {
    sessionStorage.setItem(SESSION_SETTINGS_KEY, JSON.stringify(normalized))
    localStorage.removeItem(SETTINGS_KEY)
  }
}

export function clearSettings() {
  localStorage.removeItem(SETTINGS_KEY)
  sessionStorage.removeItem(SESSION_SETTINGS_KEY)
}

export function maskSecret(value: string) {
  if (!value) return '未填写'
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`
}
