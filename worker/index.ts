import type { AspectRatio, Ratio, ResolutionTier } from '../src/types'

interface Env {
  ASSETS: Fetcher
  ACCESS_PASSWORD?: string
  ALLOW_HTTP_API?: string
  ALLOW_PRIVATE_HOSTS?: string
}

type Mode = 'text-to-image' | 'image-to-image'

interface InputImagePayload {
  name?: string
  type?: string
  dataUrl?: string
  size?: number
}

interface GeneratePayload {
  mode?: Mode
  prompt?: string
  ratio?: AspectRatio
  resolution?: ResolutionTier
  model?: string
  baseUrl?: string
  apiKey?: string
  timeoutSec?: number
  count?: number
  concurrency?: number
  inputImages?: InputImagePayload[]
  inputImage?: InputImagePayload | null
}

interface PixhostUploadPayload {
  image?: string
  fileName?: string
}

interface NormalizedPayload {
  mode: Mode
  prompt: string
  ratio: AspectRatio
  resolution: ResolutionTier
  size: string
  model: string
  baseUrl: string
  apiKey: string
  timeoutSec: number
  count: number
  concurrency: number
  inputImages: InputImagePayload[]
}

interface ResultItem {
  index: number
  ok: boolean
  image?: string
  mime?: string
  error?: string
  status?: number
  elapsedMs?: number
}

const SIZE_MAP: Record<Exclude<ResolutionTier, 'auto'>, Record<Ratio, string>> = {
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

function isFixedRatio(ratio: AspectRatio): ratio is Ratio {
  return ratio !== 'auto'
}

function isFixedResolution(resolution: ResolutionTier): resolution is Exclude<ResolutionTier, 'auto'> {
  return resolution !== 'auto'
}

function getImageSize(ratio: AspectRatio, resolution: ResolutionTier) {
  return isFixedRatio(ratio) && isFixedResolution(resolution) ? SIZE_MAP[resolution][ratio] : '自动'
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Access-Password, Authorization',
}

const PIXHOST_UPLOAD_URL = 'https://api.pixhost.to/images'
const PIXHOST_MAX_BYTES = 10 * 1024 * 1024
const PIXHOST_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif'])

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (url.pathname === '/api/health') {
      const auth = requireAccessPassword(request, env)
      if (auth) return auth
      return json({ ok: true, message: 'Worker is ready' })
    }

    if (url.pathname === '/api/generate-stream') {
      const auth = requireAccessPassword(request, env)
      if (auth) return auth
      if (request.method !== 'POST') {
        return jsonError('bad_request', '仅支持 POST 请求', 405)
      }
      return handleGenerateStream(request, env, ctx)
    }

    if (url.pathname === '/api/upload-pixhost') {
      const auth = requireAccessPassword(request, env)
      if (auth) return auth
      if (request.method !== 'POST') {
        return jsonError('bad_request', '仅支持 POST 请求', 405)
      }
      return handlePixhostUpload(request)
    }

    return env.ASSETS.fetch(request)
  },
}

async function handlePixhostUpload(request: Request) {
  let payload: PixhostUploadPayload
  try {
    payload = await request.json() as PixhostUploadPayload
  } catch {
    return jsonError('bad_request', '请求体不是有效 JSON', 400)
  }

  try {
    const { blob, mime } = dataUrlToBlob(payload.image || '')
    if (!PIXHOST_IMAGE_TYPES.has(mime)) {
      return jsonError('bad_request', 'PiXhost 仅支持 JPG、PNG、GIF 图片', 400)
    }
    if (blob.size > PIXHOST_MAX_BYTES) {
      return jsonError('bad_request', 'PiXhost 单张图片最大 10MB', 413)
    }

    const fileName = normalizeUploadFileName(payload.fileName, mime)
    const form = new FormData()
    form.append('img', blob, fileName)
    form.append('content_type', '0')
    form.append('max_th_size', '420')

    const upstream = await fetch(PIXHOST_UPLOAD_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
    })

    if (!upstream.ok) {
      return jsonError('upstream_error', await readUpstreamError(upstream), upstream.status)
    }

    const data = await upstream.json() as Record<string, unknown>
    const showUrl = typeof data.show_url === 'string' ? data.show_url : ''
    const thumbUrl = typeof data.th_url === 'string' ? data.th_url : ''
    if (!showUrl) {
      return jsonError('upstream_error', 'PiXhost 未返回图片 URL', 502)
    }

    return json({
      ok: true,
      name: typeof data.name === 'string' ? data.name : fileName,
      showUrl: toPixhostDirectImageUrl(showUrl),
      thumbUrl: thumbUrl ? normalizePublicUrl(thumbUrl) : undefined,
    })
  } catch (error) {
    return jsonError('bad_request', error instanceof Error ? error.message : '图床上传失败', 400)
  }
}

async function handleGenerateStream(request: Request, env: Env, ctx: ExecutionContext) {
  let payload: GeneratePayload
  try {
    payload = await request.json() as GeneratePayload
  } catch {
    return jsonError('bad_request', '请求体不是有效 JSON', 400)
  }

  let data: NormalizedPayload
  try {
    data = normalizePayload(payload, env)
  } catch (error) {
    return jsonError('invalid_config', error instanceof Error ? error.message : '参数无效', 400)
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const streamPromise = streamGenerate(writer, data)
  ctx.waitUntil(streamPromise.catch(() => undefined))

  return new Response(readable, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function streamGenerate(writer: WritableStreamDefaultWriter<Uint8Array>, data: NormalizedPayload) {
  const encoder = new TextEncoder()
  const startedAt = Date.now()
  let closed = false
  let writeChain = Promise.resolve()

  function send(event: string, payload: unknown) {
    if (closed) return writeChain
    const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    writeChain = writeChain
      .then(() => writer.write(encoder.encode(chunk)))
      .catch(() => {
        closed = true
      })
    return writeChain
  }

  const pingTimer = setInterval(() => {
    void send('ping', { time: Date.now() })
  }, 10_000)

  try {
    await send('start', {
      mode: data.mode,
      ratio: data.ratio,
      resolution: data.resolution,
      size: data.size,
      model: data.model,
      count: data.count,
    })

    const tasks = Array.from({ length: data.count }, (_, index) => () => generateOne(data, index))
    await runPoolWithEmit(tasks, data.concurrency, async (result) => {
      await send('result', result)
    })

    await send('done', {
      ok: true,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (error) {
    await send('error', {
      ok: false,
      type: 'internal_error',
      message: error instanceof Error ? error.message : '流式生成失败',
      status: 500,
    })
  } finally {
    clearInterval(pingTimer)
    await writeChain.catch(() => undefined)
    if (!closed) {
      await writer.close().catch(() => undefined)
    }
  }
}

function requireAccessPassword(request: Request, env: Env): Response | null {
  const expected = (env.ACCESS_PASSWORD || '').trim()
  if (!expected || expected === 'change-me') {
    return jsonError('invalid_config', 'Worker 访问密码尚未配置，请先修改 ACCESS_PASSWORD', 503)
  }

  const header = request.headers.get('X-Access-Password')?.trim()
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  const provided = header || bearer || ''

  if (provided !== expected) {
    return jsonError('auth_error', 'Worker 访问密码错误或缺失', 401)
  }

  return null
}

function normalizePayload(payload: GeneratePayload, env: Env): NormalizedPayload {
  const mode = payload.mode === 'image-to-image' ? 'image-to-image' : 'text-to-image'
  const prompt = String(payload.prompt || '').trim()
  const ratio = isRatio(payload.ratio) ? payload.ratio : 'auto'
  const resolution = isResolution(payload.resolution) ? payload.resolution : 'standard'
  const size = getImageSize(ratio, resolution)
  const model = String(payload.model || '').trim()
  const baseUrl = normalizeBaseUrl(String(payload.baseUrl || '').trim(), env)
  const apiKey = String(payload.apiKey || '').trim()
  const timeoutSec = clamp(Number(payload.timeoutSec), 10, 900, 420)
  const count = clamp(Number(payload.count), 1, 12, 1)
  const concurrency = clamp(Number(payload.concurrency), 1, 6, 2)
  const inputImages = normalizeInputImages(payload)

  if (!prompt) throw new Error('提示词不能为空')
  if (!model) throw new Error('模型不能为空')
  if (!apiKey) throw new Error('API Key 不能为空')
  if (mode === 'image-to-image' && inputImages.length === 0) throw new Error('图生图模式缺少参考图')

  return { mode, prompt, ratio, resolution, size, model, baseUrl, apiKey, timeoutSec, count, concurrency, inputImages }
}

function normalizeInputImages(payload: GeneratePayload) {
  const fromArray = Array.isArray(payload.inputImages) ? payload.inputImages : []
  const legacy = payload.inputImage ? [payload.inputImage] : []
  return [...fromArray, ...legacy]
    .filter((image): image is InputImagePayload => Boolean(image?.dataUrl))
    .slice(0, 8)
}

function normalizeBaseUrl(value: string, env: Env) {
  if (!value) throw new Error('API URL 不能为空')

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

  const allowHttp = String(env.ALLOW_HTTP_API || 'true').toLowerCase() === 'true'
  if (url.protocol === 'http:' && !allowHttp) {
    throw new Error('当前 Worker 未允许 HTTP API；如需开启请设置 ALLOW_HTTP_API=true')
  }

  const allowPrivate = String(env.ALLOW_PRIVATE_HOSTS || 'false').toLowerCase() === 'true'
  if (!allowPrivate && isBlockedHost(url.hostname)) {
    throw new Error('出于安全考虑，默认不允许代理 localhost、内网或 metadata 地址')
  }

  trimmed = url.toString().replace(/\/+$/, '')
  return trimmed
}

function isRatio(value: unknown): value is AspectRatio {
  return value === 'auto' || (typeof value === 'string' && Object.prototype.hasOwnProperty.call(SIZE_MAP.standard, value))
}

function isResolution(value: unknown): value is ResolutionTier {
  return value === 'auto' || value === 'standard' || value === '2k' || value === '4k'
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === 'metadata.google.internal') return true
  if (host === '169.254.169.254') return true

  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

async function runPoolWithEmit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  onResult: (result: T) => Promise<void> | void,
): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const index = next++
      const result = await tasks[index]()
      results[index] = result
      await onResult(result)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()))
  return results
}

async function generateOne(payload: NormalizedPayload, index: number): Promise<ResultItem> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), payload.timeoutSec * 1000)

  try {
    const upstream = payload.mode === 'image-to-image'
      ? await callImageEdit(payload, controller.signal)
      : await callTextImage(payload, controller.signal)

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
      error: message === 'The operation was aborted.' || /abort|timeout/i.test(message) ? '请求超时' : message,
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

function buildUpstreamUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function normalizeUploadFileName(value: unknown, mime: string) {
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png'
  const raw = typeof value === 'string' && value.trim() ? value.trim() : `ai-image.${ext}`
  const safe = raw
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 96)
  return /\.[a-z0-9]{2,5}$/i.test(safe) ? safe : `${safe}.${ext}`
}

function normalizePublicUrl(value: string) {
  return value.startsWith('//') ? `https:${value}` : value
}

function toPixhostDirectImageUrl(value: string) {
  const normalized = normalizePublicUrl(value)
  try {
    const url = new URL(normalized)
    const match = url.pathname.match(/^\/show\/([^/]+)\/(.+)$/)
    if (match && /(^|\.)pixhost\.to$/i.test(url.hostname)) {
      return `https://img2.pixhost.to/images/${match[1]}/${match[2]}`
    }
  } catch {
    // fall through to original URL
  }
  return normalized
}

async function callTextImage(payload: NormalizedPayload, signal: AbortSignal) {
  const body: { model: string; prompt: string; n: number; response_format: string; size?: string } = {
    model: payload.model,
    prompt: payload.prompt,
    n: 1,
    response_format: 'b64_json',
  }
  if (payload.size !== '自动') body.size = payload.size

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

async function callImageEdit(payload: NormalizedPayload, signal: AbortSignal) {
  if (!payload.inputImages.length) throw new Error('缺少参考图')

  const form = new FormData()
  form.append('model', payload.model)
  form.append('prompt', payload.prompt)
  if (payload.size !== '自动') form.append('size', payload.size)
  form.append('n', '1')
  form.append('response_format', 'b64_json')
  for (let index = 0; index < payload.inputImages.length; index += 1) {
    const inputImage = payload.inputImages[index]
    const { blob, mime } = dataUrlToBlob(inputImage.dataUrl || '')
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

async function readUpstreamError(response: Response) {
  if (response.status === 524) return formatCloudflare524Error()
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
    if (/524|cloudflare/i.test(text)) return formatCloudflare524Error()
    return text.slice(0, 800) || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function formatCloudflare524Error() {
  return 'HTTP 524：Cloudflare 100 秒自动熔断，可切换其他线路域名或改用非 Cloudflare 中转后重试'
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function jsonError(type: string, message: string, status: number) {
  return json({ ok: false, type, message, status }, status)
}
