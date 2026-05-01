import { useState } from 'react'
import type { GenerateResultItem } from '../types'
import { copyImageToClipboard, copyTextToClipboard, downloadDataUrl } from '../lib/api'
import { ImagePreviewModal } from './ImagePreviewModal'

interface Props {
  loading: boolean
  placeholders: number
  results: GenerateResultItem[]
  onUploadImage: (result: GenerateResultItem) => void
  onUseAsReference: (dataUrl: string) => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
}

type PreviewState = {
  src: string
  title: string
  remoteUrl?: string
}

type ResultCard = { index: number; loading: true } | (GenerateResultItem & { loading: false })

export function ResultGrid({ loading, placeholders, results, onUploadImage, onUseAsReference, onMessage }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null)

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
    const src = card.image || card.remoteUrl
    if (!src) return
    setPreview({
      src,
      title: `生成结果 ${card.index + 1}`,
      remoteUrl: card.remoteUrl,
    })
  }

  async function copyResultImage(src: string) {
    try {
      await copyImageToClipboard(src, `ai-image-${Date.now()}.png`)
      onMessage('图片已复制到剪贴板', 'ok')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '复制失败，浏览器可能未授权剪贴板', 'error')
    }
  }

  async function copyRemoteUrl(url: string) {
    try {
      await copyTextToClipboard(url)
      onMessage('图床 URL 已复制', 'ok')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '复制 URL 失败，浏览器可能未授权剪贴板', 'error')
    }
  }

  async function downloadResultImage(src: string, index: number) {
    try {
      await downloadDataUrl(src, `ai-image-${Date.now()}-${index + 1}.png`)
      onMessage('图片已保存', 'ok')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '下载失败，请稍后重试', 'error')
    }
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
          ) : card.ok && (card.image || card.remoteUrl) ? (
            (() => {
              const src = card.image || card.remoteUrl!
              const canUseAsReference = Boolean(card.image?.startsWith('data:'))
              return (
            <>
              <img src={src} alt={`生成结果 ${card.index + 1}`} />
              <div className="floating-actions">
                <button
                  type="button"
                  className="zoom-btn"
                  onClick={() => openPreview(card)}
                  aria-label={`放大预览第 ${card.index + 1} 张图片`}
                  title="放大预览"
                >
                  ⛶
                </button>
                {card.remoteUrl ? (
                  <button type="button" className="url-copy-btn" onClick={() => void copyRemoteUrl(card.remoteUrl!)}>
                    复制URL
                  </button>
                ) : card.uploading ? (
                  <button type="button" className="url-copy-btn" disabled>上传中</button>
                ) : card.uploadError ? (
                  <button type="button" className="url-copy-btn error" title={card.uploadError} onClick={() => onUploadImage(card)}>重试上传</button>
                ) : (
                  <button type="button" className="url-copy-btn" onClick={() => onUploadImage(card)}>上传图床</button>
                )}
              </div>
              <div className="card-toolbar">
                <button
                  type="button"
                  onClick={() => void downloadResultImage(src, card.index)}
                >下载</button>
                <button type="button" onClick={() => void copyResultImage(src)}>复制</button>
                {canUseAsReference ? (
                  <button type="button" onClick={() => onUseAsReference(card.image!)}>作为参考图</button>
                ) : null}
              </div>
              <small className="card-meta">#{card.index + 1} · {card.elapsedMs ? `${(card.elapsedMs / 1000).toFixed(1)}s` : '完成'}</small>
            </>
              )
            })()
          ) : (
            <div className="error-card">
              <strong>第 {card.index + 1} 张失败</strong>
              <p>{card.error || '未知错误'}</p>
              {card.status ? <small>HTTP {card.status}</small> : null}
            </div>
          )}
        </article>
      ))}
      {preview ? (
        <ImagePreviewModal
          src={preview.src}
          title={preview.title}
          remoteUrl={preview.remoteUrl}
          onCopyImage={() => copyResultImage(preview.src)}
          onCopyRemoteUrl={preview.remoteUrl ? () => copyRemoteUrl(preview.remoteUrl!) : undefined}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </div>
  )
}
