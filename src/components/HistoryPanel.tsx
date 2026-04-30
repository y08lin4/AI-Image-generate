import type { HistoryItem } from '../types'
import { getResolutionLabel } from '../lib/ratios'

interface Props {
  items: HistoryItem[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onReusePrompt: (prompt: string) => void
  onUseImage: (dataUrl: string) => void
  onDelete: (id: string) => void
  onClear: () => void
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HistoryPanel({ items, collapsed, onToggleCollapsed, onReusePrompt, onUseImage, onDelete, onClear }: Props) {
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
                  <button type="button" key={`${item.id}-${index}`} onClick={() => onUseImage(src)} title="作为参考图">
                    <img src={src} alt="历史图片" />
                  </button>
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
    </aside>
  )
}
