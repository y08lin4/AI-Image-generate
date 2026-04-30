import type {
  AspectRatio,
  GenerateErrorResponse,
  GenerateRequest,
  GenerateResultItem,
  GenerateSuccessResponse,
  InputImage,
  StreamEvent,
} from '../types'
import { getImageSize } from './ratios'

export function createId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function fileToInputImage(file: File): Promise<InputImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      resolve({
        id: createId('input'),
        name: file.name,
        type: file.type || 'image/png',
        dataUrl,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)
  })
}

export async function generateImagesStream(
  payload: GenerateRequest,
  accessPassword: string,
  onEvent: (event: StreamEvent) => void,
): Promise<GenerateSuccessResponse> {
  const startedAt = Date.now()
  const response = await fetch('/api/generate-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Password': accessPassword,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await parseErrorResponse(response)
    throw new Error(error.message)
  }

  if (!response.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const results = new Array<GenerateResultItem>()
  let meta = {
    mode: payload.mode,
    ratio: payload.ratio,
    resolution: payload.resolution,
    size: getImageSize(payload.ratio, payload.resolution),
    model: payload.model,
  }
  let elapsedMs = 0
  const state: { fatalError?: GenerateErrorResponse } = {}

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  const handleBlock = (block: string) => {
    const lines = block.split('\n')
    let eventName = 'message'
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }

    if (!dataLines.length) return
    const raw = dataLines.join('\n')
    const data = JSON.parse(raw) as unknown
    const event = { event: eventName, data } as StreamEvent
    onEvent(event)

    if (event.event === 'start') {
      meta = {
        mode: event.data.mode,
        ratio: event.data.ratio,
        resolution: event.data.resolution,
        size: event.data.size,
        model: event.data.model,
      }
    } else if (event.event === 'result') {
      results[event.data.index] = event.data
    } else if (event.event === 'done') {
      elapsedMs = event.data.elapsedMs
    } else if (event.event === 'error') {
      state.fatalError = event.data
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 2)
      if (block) handleBlock(block)
      boundary = buffer.indexOf('\n\n')
    }
  }

  const tail = buffer.trim()
  if (tail) handleBlock(tail)

  if (state.fatalError) throw new Error(state.fatalError.message)

  const compactResults = results.filter(Boolean)
  return {
    ok: true,
    ...meta,
    elapsedMs: elapsedMs || Date.now() - startedAt,
    results: compactResults,
  }
}

export async function generateImagesDirect(
  payload: GenerateRequest,
  onResult: (result: GenerateResultItem) => void,
): Promise<GenerateSuccessResponse> {
  const startedAt = Date.now()
  const normalizedPayload = {
    ...payload,
    baseUrl: normalizeBaseUrlForBrowser(payload.baseUrl),
    count: clamp(payload.count, 1, 12, 1),
    concurrency: clamp(payload.concurrency, 1, 6, 2),
    timeoutSec: clamp(payload.timeoutSec, 10, 900, 420),
  }
  const tasks = Array.from({ length: normalizedPayload.count }, (_, index) => () => generateOneDirect(normalizedPayload, index))
  const results = await runPool(tasks, normalizedPayload.concurrency, onResult)

  return {
    ok: true,
    mode: normalizedPayload.mode,
    ratio: normalizedPayload.ratio,
    resolution: normalizedPayload.resolution,
    size: getImageSize(normalizedPayload.ratio, normalizedPayload.resolution),
    model: normalizedPayload.model,
    elapsedMs: Date.now() - startedAt,
    results,
  }
}

export async function checkWorkerPassword(accessPassword: string): Promise<{ ok: boolean; message: string }> {
  const response = await fetch('/api/health', {
    headers: { 'X-Access-Password': accessPassword },
  })
  if (response.ok) return { ok: true, message: 'Worker 密码验证通过' }
  const data = await response.json().catch(() => null) as { message?: string } | null
  return { ok: false, message: data?.message || `验证失败：HTTP ${response.status}` }
}

export async function uploadImageToPixhost(
  dataUrl: string,
  fileName: string,
  accessPassword: string,
): Promise<{ remoteUrl: string; remoteThumbUrl?: string }> {
  const response = await fetch('/api/upload-pixhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Password': accessPassword,
    },
    body: JSON.stringify({ image: dataUrl, fileName }),
  })

  const data = await response.json().catch(() => null) as {
    ok?: boolean
    message?: string
    showUrl?: string
    thumbUrl?: string
  } | null

  if (!response.ok || !data?.ok || !data.showUrl) {
    throw new Error(data?.message || formatHttpError(response.status, '图床上传失败'))
  }

  return { remoteUrl: data.showUrl, remoteThumbUrl: data.thumbUrl }
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function copyImageToClipboard(dataUrl: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type || 'image/png']: blob }),
  ])
}

async function generateOneDirect(payload: GenerateRequest, index: number): Promise<GenerateResultItem> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort('timeout'), payload.timeoutSec * 1000)

  try {
    const upstream = payload.mode === 'image-to-image'
      ? await callImageEditDirect(payload, controller.signal)
      : await callTextImageDirect(payload, controller.signal)

    if (!upstream.ok) {
      return {
        index,
        ok: false,
        status: upstream.status,
        error: await readUpstreamError(upstream),
        elapsedMs: Date.now() - startedAt,
      }
    }

    const parsed = await parseImageResponse(upstream, controller.signal)
    if (!parsed.image) {
      return { index, ok: false, error: '上游没有返回可用图片', elapsedMs: Date.now() - startedAt }
    }

    return {
      index,
      ok: true,
      image: parsed.image,
      mime: parsed.mime,
      elapsedMs: Date.now() - startedAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      index,
      ok: false,
      error: formatFetchError(message),
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function callTextImageDirect(payload: GenerateRequest, signal: AbortSignal) {
  const body: { model: string; prompt: string; n: number; response_format: string; size?: string } = {
    model: payload.model,
    prompt: payload.prompt,
    n: 1,
    response_format: 'b64_json',
  }
  const size = getRequestedSize(payload)
  if (size) body.size = size

  return fetch(buildUpstreamUrl(payload.baseUrl, 'images/generations'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.apiKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
    signal,
  })
}

async function callImageEditDirect(payload: GenerateRequest, signal: AbortSignal) {
  const inputImages = payload.inputImages || []
  if (!inputImages.length) throw new Error('缺少参考图')

  const form = new FormData()
  form.append('model', payload.model)
  form.append('prompt', payload.prompt)
  const size = getRequestedSize(payload)
  if (size) form.append('size', size)
  form.append('n', '1')
  form.append('response_format', 'b64_json')

  for (let index = 0; index < inputImages.length; index += 1) {
    const inputImage = inputImages[index]
    const { blob, mime } = dataUrlToBlob(inputImage.dataUrl)
    form.append('image[]', blob, inputImage.name || `input-${index + 1}.${mime.split('/')[1] || 'png'}`)
  }

  return fetch(buildUpstreamUrl(payload.baseUrl, 'images/edits'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${payload.apiKey}`,
      'Cache-Control': 'no-store',
    },
    body: form,
    signal,
  })
}

async function runPool<T>(tasks: Array<() => Promise<T>>, limit: number, onResult?: (result: T) => void): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const index = next++
      const result = await tasks[index]()
      results[index] = result
      onResult?.(result)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()))
  return results
}

function normalizeBaseUrlForBrowser(value: string) {
  let trimmed = value.trim()
    .replace(/\/+$/, '')
    .replace(/\/images\/generations$/i, '')
    .replace(/\/images\/edits$/i, '')

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('API URL 格式无效')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('API URL 仅支持 http 或 https')
  }

  if (window.location.protocol === 'https:' && url.protocol === 'http:') {
    throw new Error('浏览器直连模式下，HTTPS 页面不能请求 HTTP API；请改用 Worker 代理或 HTTPS API')
  }

  return url.toString().replace(/\/+$/, '')
}

function buildUpstreamUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function getRequestedSize(payload: Pick<GenerateRequest, 'ratio' | 'resolution'>) {
  const size = getImageSize(payload.ratio, payload.resolution)
  return size === '自动' ? undefined : size
}

function formatFetchError(message: string) {
  if (/abort|timeout|operation was aborted/i.test(message)) {
    return '请求超时：生图通常需要 100-300 秒，请调高超时时间或改用 Worker 流式代理'
  }
  if (/524|cloudflare/i.test(message)) return formatCloudflare524Error()
  if (/cors/i.test(message)) {
    return 'CORS：浏览器直连被上游拦截，建议切换到 Worker 流式代理模式'
  }
  if (/failed to fetch|load failed|networkerror/i.test(message)) {
    return '浏览器直连失败，可能是 CORS 或网络限制；建议切换到 Worker 流式代理模式'
  }
  return message || '请求失败'
}

async function parseErrorResponse(response: Response): Promise<GenerateErrorResponse> {
  const data = await response.json().catch(() => null) as GenerateErrorResponse | null
  if (data?.ok === false) {
    const status = data.status || response.status
    const shouldMapHttp = data.type === 'upstream_error' || status === 524
    return {
      ...data,
      status,
      message: shouldMapHttp ? formatHttpError(status, data.message) : data.message,
    }
  }

  return {
    ok: false,
    type: response.status === 401 ? 'auth_error' : 'upstream_error',
    message: formatHttpError(response.status),
    status: response.status,
  }
}

async function readUpstreamError(response: Response) {
  const detail = await readResponseErrorDetail(response)
  return formatHttpError(response.status, detail)
}

async function readResponseErrorDetail(response: Response) {
  const contentType = response.headers.get('Content-Type') || ''
  try {
    if (contentType.includes('application/json')) {
      const data = await response.json() as Record<string, unknown>
      const error = data.error as Record<string, unknown> | undefined
      if (typeof error?.message === 'string') return error.message
      if (typeof data.message === 'string') return data.message
      return JSON.stringify(data).slice(0, 800)
    }
    const text = await response.text()
    return text.slice(0, 800)
  } catch {
    return ''
  }
}

function formatHttpError(status: number, detail?: string) {
  if (status === 401) return appendErrorDetail('HTTP 401：API Key 错误或额度问题，请检查 Key、账户余额和接口权限', detail)
  if (status === 403) return appendErrorDetail('HTTP 403：无权限访问该接口或模型，模型可能不可用', detail)
  if (status === 413) return appendErrorDetail('HTTP 413：图片太大，请压缩图片、减少参考图或降低分辨率后重试', detail)
  if (status === 429) return appendErrorDetail('HTTP 429：请求过多触发限流，请降低并发、减少张数或稍后重试', detail)
  if (status === 524) return formatCloudflare524Error()
  const fallback = detail?.trim()
  return fallback || `请求失败：HTTP ${status}`
}

function appendErrorDetail(base: string, detail?: string) {
  const clean = detail?.trim()
  if (!clean || clean === base || /^HTTP\s+\d+$/i.test(clean)) return base
  if (/524|cloudflare/i.test(clean)) return formatCloudflare524Error()
  return `${base}；上游详情：${clean.slice(0, 300)}`
}

function formatCloudflare524Error() {
  return 'HTTP 524：Cloudflare 100 秒自动熔断，可切换其他线路域名，或改用非 Cloudflare 中转后重试'
}

async function parseImageResponse(response: Response, signal: AbortSignal): Promise<{ image?: string; mime?: string }> {
  const contentType = response.headers.get('Content-Type') || ''
  if (contentType.startsWith('image/')) {
    const blob = await response.blob()
    return { image: await blobToDataUrl(blob, contentType), mime: contentType }
  }

  const payload = await response.json() as Record<string, unknown>
  const data = payload.data
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      if (typeof record.b64_json === 'string' && record.b64_json.trim()) {
        return { image: normalizeBase64Image(record.b64_json, 'image/png'), mime: 'image/png' }
      }
      if (typeof record.url === 'string' && /^https?:\/\//i.test(record.url)) {
        return await fetchImageUrl(record.url, signal)
      }
    }
  }

  return {}
}

async function fetchImageUrl(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`图片 URL 下载失败：HTTP ${res.status}`)
  const mime = res.headers.get('Content-Type') || 'image/png'
  const blob = await res.blob()
  return { image: await blobToDataUrl(blob, mime), mime }
}

function normalizeBase64Image(value: string, fallbackMime: string) {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) throw new Error('参考图 data URL 无效')
  const mime = match[1] || 'image/png'
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ''
  const bytes = isBase64 ? base64ToBytes(payload) : new TextEncoder().encode(decodeURIComponent(payload))
  return { blob: new Blob([bytes], { type: mime }), mime }
}

function base64ToBytes(base64: string) {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function blobToDataUrl(blob: Blob, fallbackMime: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return `data:${blob.type || fallbackMime};base64,${btoa(binary)}`
}
