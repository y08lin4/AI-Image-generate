export type Mode = 'text-to-image' | 'image-to-image'

export type RequestMode = 'worker' | 'background' | 'direct'

export type Ratio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9'

export type AspectRatio = 'auto' | Ratio

export type ResolutionTier = 'auto' | 'standard' | '2k' | '4k'

export interface AppSettings {
  requestMode: RequestMode
  baseUrl: string
  apiKey: string
  accessPassword: string
  model: string
  timeoutSec: number
  count: number
  concurrency: number
  defaultRatio: AspectRatio
  defaultResolution: ResolutionTier
  autoUploadPixhost: boolean
  rememberSecrets: boolean
}

export interface InputImage {
  id: string
  name: string
  type: string
  dataUrl: string
  size: number
}

export interface GenerateRequest {
  mode: Mode
  prompt: string
  ratio: AspectRatio
  resolution: ResolutionTier
  model: string
  baseUrl: string
  apiKey: string
  timeoutSec: number
  count: number
  concurrency: number
  inputImages?: InputImage[]
}

export interface GenerateResultItem {
  index: number
  ok: boolean
  image?: string
  mime?: string
  error?: string
  status?: number
  elapsedMs?: number
  remoteUrl?: string
  remoteThumbUrl?: string
  localImageUrl?: string
  localImageBytes?: number
  uploading?: boolean
  uploadError?: string
}

export type BackgroundTaskStatus = 'queued' | 'running' | 'uploading' | 'completed' | 'failed' | 'partial_failed'

export interface BackgroundTask {
  id: string
  status: BackgroundTaskStatus
  mode: Mode
  prompt: string
  ratio: AspectRatio
  resolution: ResolutionTier
  size: string
  model: string
  count: number
  concurrency: number
  results: GenerateResultItem[]
  error?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
  elapsedMs?: number
  retryOf?: string
}

export interface BackgroundStats {
  today: string
  todayGenerated: number
  totalGenerated: number
}

export interface GenerateSuccessResponse {
  ok: true
  mode: Mode
  ratio: AspectRatio
  resolution: ResolutionTier
  size: string
  model: string
  elapsedMs: number
  results: GenerateResultItem[]
}

export interface GenerateErrorResponse {
  ok: false
  type: 'auth_error' | 'invalid_config' | 'upstream_error' | 'bad_request' | 'internal_error'
  message: string
  status?: number
}

export type StreamEvent =
  | { event: 'start'; data: { mode: Mode; ratio: AspectRatio; resolution: ResolutionTier; size: string; model: string; count: number } }
  | { event: 'ping'; data: { time: number } }
  | { event: 'result'; data: GenerateResultItem }
  | { event: 'done'; data: { ok: true; elapsedMs: number } }
  | { event: 'error'; data: GenerateErrorResponse }

export interface HistoryItem {
  id: string
  createdAt: number
  mode: Mode
  prompt: string
  ratio: AspectRatio
  resolution?: ResolutionTier
  size: string
  model: string
  images: string[]
  imageResultIndexes?: number[]
  remoteUrls?: string[]
  remoteThumbUrls?: string[]
  failedCount: number
  elapsedMs: number
}

export type GenerationTaskStatus = 'running' | 'completed' | 'failed'

export interface GenerationTask {
  id: string
  cloudTaskId?: string
  cloudStatus?: BackgroundTaskStatus
  retryOf?: string
  createdAt: number
  mode: Mode
  requestMode: RequestMode | 'history'
  prompt: string
  ratio: AspectRatio
  resolution: ResolutionTier
  size: string
  model: string
  count: number
  concurrency: number
  status: GenerationTaskStatus
  results: GenerateResultItem[]
  elapsedMs?: number
  error?: string
}
