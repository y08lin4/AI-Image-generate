import { useState } from 'react'
import type { HistoryItem } from '../types'
import { getResolutionLabel } from '../lib/ratios'
import { copyImageToClipboard, copyTextToClipboard } from '../lib/api'
import { ImagePreviewModal } from './ImagePreviewModal'

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
  remoteUrl?: string
}

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

  function openPreview(src: string, index: number, remoteUrl?: string) {
    setPreview({
      src,
      title: `历史图片 ${index + 1}`,
      remoteUrl,
    })
  }

  async function copyHistoryImage(src: string) {
    try {
      await copyImageToClipboard(src, `ai-image-history-${Date.now()}.png`)
      onMessage('历史图片已复制到剪贴板', 'ok')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '复制失败，浏览器可能未授权剪贴板', 'error')
    }
  }

  async function copyHistoryUrl(url: string) {
    try {
      await copyTextToClipboard(url)
      onMessage('历史图床 URL 已复制', 'ok')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '复制 URL 失败，浏览器可能未授权剪贴板', 'error')
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
                {item.images.slice(0, 3).map((src, index) => {
                  const remoteUrl = item.remoteUrls?.[index]
                  const canUseAsReference = src.startsWith('data:')
                  return (
                    <div className="history-thumb-card" key={`${item.id}-${index}`}>
                      <button type="button" className="history-thumb-image" onClick={() => openPreview(src, index, remoteUrl)} title="放大预览">
                        <img src={src} alt={`历史图片 ${index + 1}`} />
                      </button>
                      <div className="history-thumb-actions">
                        <button type="button" onClick={() => openPreview(src, index, remoteUrl)}>放大</button>
                        <button type="button" onClick={() => void copyHistoryImage(src)}>复制</button>
                        {remoteUrl ? <button type="button" onClick={() => void copyHistoryUrl(remoteUrl)}>URL</button> : null}
                        {canUseAsReference ? <button type="button" onClick={() => onUseImage(src)}>参考</button> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="history-info">
                <p>{item.prompt}</p>
                <small>
                  {formatTime(item.createdAt)} · {item.mode === 'image-to-image' ? '图生图' : '文生图'} · {item.ratio === 'auto' ? '自动' : item.ratio}
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

      {preview ? (
        <ImagePreviewModal
          src={preview.src}
          title={preview.title}
          remoteUrl={preview.remoteUrl}
          onCopyImage={() => copyHistoryImage(preview.src)}
          onCopyRemoteUrl={preview.remoteUrl ? () => copyHistoryUrl(preview.remoteUrl!) : undefined}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </aside>
  )
}
