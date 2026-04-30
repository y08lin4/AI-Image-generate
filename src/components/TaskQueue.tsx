import type { GenerationTask } from '../types'
import { getResolutionLabel } from '../lib/ratios'
import { ResultGrid } from './ResultGrid'

interface Props {
  tasks: GenerationTask[]
  onUseAsReference: (dataUrl: string) => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
  onRemove: (id: string) => void
  onClearFinished: () => void
}

function formatDuration(ms?: number) {
  if (!ms) return '运行中'
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function statusText(task: GenerationTask) {
  if (task.status === 'running') return '生成中'
  if (task.status === 'failed') return '失败'
  const okCount = task.results.filter((item) => item.ok && item.image).length
  const failedCount = task.results.length - okCount
  return failedCount ? `部分完成 ${okCount}/${task.count}` : '已完成'
}

export function TaskQueue({ tasks, onUseAsReference, onMessage, onRemove, onClearFinished }: Props) {
  if (!tasks.length) {
    return (
      <div className="empty-state">
        <div className="empty-card">输入提示词后点击提交任务</div>
      </div>
    )
  }

  const hasFinished = tasks.some((task) => task.status !== 'running')

  return (
    <div className="task-queue">
      <div className="task-queue-toolbar">
        <span>{tasks.length} 个任务</span>
        <button type="button" className="ghost-btn small" onClick={onClearFinished} disabled={!hasFinished}>
          清理已结束
        </button>
      </div>

      <div className="task-stack">
        {tasks.map((task) => (
          <article key={task.id} className={`task-card status-${task.status}`}>
            <header className="task-header">
              <div className="task-title">
                <div>
                  <strong>{task.mode === 'image-to-image' ? '图生图' : '文生图'} · {task.ratio} · {getResolutionLabel(task.resolution)} · {task.size}</strong>
                  <p>{task.prompt}</p>
                </div>
              </div>
              <div className="task-meta">
                <span className={`status-pill ${task.status}`}>{statusText(task)}</span>
                <small>{formatTime(task.createdAt)} · {task.requestMode === 'worker' ? 'Worker' : '直连'} · 并发 {task.concurrency} · {formatDuration(task.elapsedMs)}</small>
                {task.status !== 'running' ? (
                  <button type="button" className="ghost-btn small" onClick={() => onRemove(task.id)}>移除</button>
                ) : null}
              </div>
            </header>

            {task.error ? <div className="task-error">{task.error}</div> : null}

            <ResultGrid
              loading={task.status === 'running'}
              placeholders={task.count}
              results={task.results}
              onUseAsReference={onUseAsReference}
              onMessage={onMessage}
            />
          </article>
        ))}
      </div>
    </div>
  )
}
