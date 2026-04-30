import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { HistoryItem } from '../types'
import { getResolutionLabel } from '../lib/ratios'
import { copyImageToClipboard } from '../lib/api'

interface Props {
  items: HistoryItem[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onReusePrompt: (prompt: string) => void
  onUseImage: (dataUrl: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
}

type PreviewState = {
  src: string
  title: string
  fileSize: string
  dimensions?: ImageDimensions
}

type ImageDimensions = { width: number; height: number }

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HistoryPanel({ items, collapsed, onToggleCollapsed, onReusePrompt, onUseImage, onDelete, onClear, onMessage }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null)

  useEffect(() => {
    if (!preview) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreview(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [preview])

  function openPreview(src: string, index: number) {
    setPreview({
      src,
      title: `历史图片 ${index + 1}`,
      fileSize: formatImageSize(src),
    })
  }

  function updatePreviewDimensions(src: string, dimensions: ImageDimensions) {
    setPreview((current) => current && current.src === src ? { ...current, dimensions } : current)
  }

  async function copyHistoryImage(src: string) {
    try {
      await copyImageToClipboard(src)
      onMessage('历史图片已复制到剪贴板', 'ok')
    } catch {
      onMessage('复制失败，浏览器可能未授权剪贴板', 'error')
    }
  }

  if (collapsed) {
    return (
      <aside className="history-panel collapsed">
        <button type="button" className="history-expand-btn" onClick={onToggleCollapsed} title="展开本地历史">
          <span>历史</span>
          <small>{items.length}</small>
        </button>
      </aside>
    )
  }

  return (
    <aside className="history-panel">
      <header className="history-header">
        <div>
          <h2>本地历史</h2>
          <p>保存在 IndexedDB，不上传服务器。</p>
        </div>
        <div className="history-header-actions">
          <button type="button" className="ghost-btn small" onClick={onToggleCollapsed}>收起</button>
          <button type="button" className="ghost-btn small" onClick={onClear} disabled={!items.length}>清空</button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="history-empty">暂无历史记录</div>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <article key={item.id} className="history-item">
              <div className="history-thumbs">
                {item.images.slice(0, 3).map((src, index) => (
                  <div className="history-thumb-card" key={`${item.id}-${index}`}>
                    <button type="button" className="history-thumb-image" onClick={() => openPreview(src, index)} title="放大预览">
                      <img src={src} alt={`历史图片 ${index + 1}`} />
                    </button>
                    <div className="history-thumb-actions">
                      <button type="button" onClick={() => openPreview(src, index)}>放大</button>
                      <button type="button" onClick={() => void copyHistoryImage(src)}>复制</button>
                      <button type="button" onClick={() => onUseImage(src)}>参考</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="history-info">
                <p>{item.prompt}</p>
                <small>
                  {formatTime(item.createdAt)} · {item.mode === 'image-to-image' ? '图生图' : '文生图'} · {item.ratio}
                  {item.resolution ? ` · ${getResolutionLabel(item.resolution)} · ${item.size}` : ''}
                  {' · '}{item.images.length} 张
                </small>
              </div>
              <div className="history-actions">
                <button type="button" onClick={() => onReusePrompt(item.prompt)}>复用提示词</button>
                <button type="button" onClick={() => onDelete(item.id)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {preview ? createPortal(
        <div className="preview-mask" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="preview-dialog" role="dialog" aria-modal="true" aria-label={preview.title}>
            <button type="button" className="preview-close" onClick={() => setPreview(null)} aria-label="关闭预览">×</button>
            <div className="preview-info">
              <span>{formatDimensions(preview.dimensions)}</span>
              <span>{formatActualRatio(preview.dimensions)}</span>
              <span>{preview.fileSize}</span>
            </div>
            <img
              src={preview.src}
              alt={preview.title}
              onLoad={(event) => updatePreviewDimensions(preview.src, {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })}
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </aside>
  )
}

function formatImageSize(dataUrl: string) {
  const bytes = getDataUrlBytes(dataUrl)
  if (!bytes) return '未知大小'
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDimensions(dimensions?: ImageDimensions) {
  return dimensions ? `${dimensions.width}×${dimensions.height}` : '读取尺寸中'
}

function formatActualRatio(dimensions?: ImageDimensions) {
  if (!dimensions) return '读取比例中'
  const divisor = gcd(dimensions.width, dimensions.height)
  return `${dimensions.width / divisor}:${dimensions.height / divisor}`
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}

function getDataUrlBytes(dataUrl: string) {
  const marker = ';base64,'
  const index = dataUrl.indexOf(marker)
  if (index < 0) return new TextEncoder().encode(dataUrl).length
  const base64 = dataUrl.slice(index + marker.length).replace(/\s/g, '')
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding)
}
