import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AspectRatio, GenerateResultItem, ResolutionTier } from '../types'
import { copyImageToClipboard, downloadDataUrl } from '../lib/api'
import { getResolutionLabel } from '../lib/ratios'

interface Props {
  loading: boolean
  placeholders: number
  results: GenerateResultItem[]
  ratio: AspectRatio
  resolution: ResolutionTier
  onUseAsReference: (dataUrl: string) => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
}

type PreviewState = {
  src: string
  title: string
  ratio: AspectRatio
  resolution: ResolutionTier
  fileSize: string
}

type ResultCard = { index: number; loading: true } | (GenerateResultItem & { loading: false })

export function ResultGrid({ loading, placeholders, results, ratio, resolution, onUseAsReference, onMessage }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null)

  useEffect(() => {
    if (!preview) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [preview])

  const empty = !loading && results.length === 0
  if (empty) {
    return (
      <div className="empty-state">
        <div className="empty-card">输入提示词后点击生成</div>
      </div>
    )
  }

  const resultMap = new Map(results.map((item) => [item.index, item]))
  const cards: ResultCard[] = loading
    ? Array.from({ length: placeholders }, (_, i) => {
        const result = resultMap.get(i)
        return result ? { ...result, loading: false } : { index: i, loading: true }
      })
    : results.map((item) => ({ ...item, loading: false }))

  function openPreview(card: GenerateResultItem) {
    if (!card.image) return
    setPreview({
      src: card.image,
      title: `生成结果 ${card.index + 1}`,
      ratio,
      resolution,
      fileSize: formatImageSize(card.image),
    })
  }

  return (
    <div className="result-grid">
      {cards.map((card) => (
        <article key={card.index} className={`result-card ${card.loading ? 'is-loading' : ''} ${!card.loading && !card.ok ? 'is-error' : ''}`}>
          {card.loading ? (
            <div className="skeleton">
              <div className="spinner" />
              <span>第 {card.index + 1} 张生成中...</span>
            </div>
          ) : card.ok && card.image ? (
            <>
              <img src={card.image} alt={`生成结果 ${card.index + 1}`} />
              <div className="floating-actions">
                {card.remoteUrl ? (
                  <button
                    type="button"
                    className="url-copy-btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(card.remoteUrl!)
                        onMessage('图床 URL 已复制', 'ok')
                      } catch {
                        onMessage('复制 URL 失败，浏览器可能未授权剪贴板', 'error')
                      }
                    }}
                  >
                    复制URL
                  </button>
                ) : card.uploading ? (
                  <button type="button" className="url-copy-btn" disabled>上传中</button>
                ) : card.uploadError ? (
                  <button type="button" className="url-copy-btn error" title={card.uploadError}>上传失败</button>
                ) : null}
                <button
                  type="button"
                  className="zoom-btn"
                  onClick={() => openPreview(card)}
                  aria-label={`放大预览第 ${card.index + 1} 张图片`}
                  title="放大预览"
                >
                  ⛶
                </button>
              </div>
              <div className="card-toolbar">
                <button
                  type="button"
                  onClick={() => downloadDataUrl(card.image!, `ai-image-${Date.now()}-${card.index + 1}.png`)}
                >下载</button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await copyImageToClipboard(card.image!)
                      onMessage('图片已复制到剪贴板', 'ok')
                    } catch {
                      onMessage('复制失败，浏览器可能未授权剪贴板', 'error')
                    }
                  }}
                >复制</button>
                <button type="button" onClick={() => onUseAsReference(card.image!)}>作为参考图</button>
              </div>
              <small className="card-meta">#{card.index + 1} · {card.elapsedMs ? `${(card.elapsedMs / 1000).toFixed(1)}s` : '完成'}</small>
            </>
          ) : (
            <div className="error-card">
              <strong>第 {card.index + 1} 张失败</strong>
              <p>{card.error || '未知错误'}</p>
              {card.status ? <small>HTTP {card.status}</small> : null}
            </div>
          )}
        </article>
      ))}
      {preview ? createPortal(
        <div className="preview-mask" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="preview-dialog" role="dialog" aria-modal="true" aria-label={preview.title}>
            <button type="button" className="preview-close" onClick={() => setPreview(null)} aria-label="关闭预览">×</button>
            <div className="preview-info">
              <span>{getResolutionLabel(preview.resolution)}</span>
              <span>{preview.ratio === 'auto' ? '自动比例' : preview.ratio}</span>
              <span>{preview.fileSize}</span>
            </div>
            <img src={preview.src} alt={preview.title} />
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function formatImageSize(dataUrl: string) {
  const bytes = getDataUrlBytes(dataUrl)
  if (!bytes) return '未知大小'
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function getDataUrlBytes(dataUrl: string) {
  const marker = ';base64,'
  const index = dataUrl.indexOf(marker)
  if (index < 0) return new TextEncoder().encode(dataUrl).length
  const base64 = dataUrl.slice(index + marker.length).replace(/\s/g, '')
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding)
}
