import { useEffect, useState } from 'react'
import type { GenerateResultItem } from '../types'
import { copyImageToClipboard, downloadDataUrl } from '../lib/api'

interface Props {
  loading: boolean
  placeholders: number
  results: GenerateResultItem[]
  onUseAsReference: (dataUrl: string) => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
}

type ResultCard = { index: number; loading: true } | (GenerateResultItem & { loading: false })

export function ResultGrid({ loading, placeholders, results, onUseAsReference, onMessage }: Props) {
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null)

  useEffect(() => {
    if (!preview) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreview(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setPreview({ src: card.image!, title: `生成结果 ${card.index + 1}` })}
                aria-label={`放大预览第 ${card.index + 1} 张图片`}
                title="放大预览"
              >
                ⛶
              </button>
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
      {preview ? (
        <div className="preview-mask" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="preview-dialog" role="dialog" aria-modal="true" aria-label={preview.title}>
            <button type="button" className="preview-close" onClick={() => setPreview(null)} aria-label="关闭预览">×</button>
            <img src={preview.src} alt={preview.title} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
