import type { BackgroundStats, GenerationTask } from '../types'
import { getResolutionLabel } from '../lib/ratios'
import { ResultGrid } from './ResultGrid'

interface Props {
  tasks: GenerationTask[]
  onUploadImage: (taskId: string, result: GenerationTask['results'][number]) => void
  onUseAsReference: (dataUrl: string) => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
  onRemove: (id: string) => void
  onClearFinished: () => void
  onSyncCloudTasks: () => void
  onRetryBackgroundTask: (taskId: string) => void
  backgroundStats: BackgroundStats | null
  syncingCloudTasks: boolean
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
  if (task.cloudStatus === 'queued') return '排队中'
  if (task.cloudStatus === 'uploading') return '上传中'
  if (task.cloudStatus === 'partial_failed') return `部分完成 ${task.results.filter((item) => item.ok && (item.image || item.remoteUrl)).length}/${task.count}`
  if (task.status === 'running') return '生成中'
  if (task.status === 'failed') return '失败'
  const okCount = task.results.filter((item) => item.ok && (item.image || item.remoteUrl)).length
  const failedCount = task.results.length - okCount
  return failedCount ? `部分完成 ${okCount}/${task.count}` : '已完成'
}

function requestModeLabel(task: GenerationTask) {
  if (task.requestMode === 'history') return '历史'
  if (task.requestMode === 'background') return '后台'
  if (task.requestMode === 'worker') return 'Worker'
  return '直连'
}

export function TaskQueue({
  tasks,
  onUploadImage,
  onUseAsReference,
  onMessage,
  onRemove,
  onClearFinished,
  onSyncCloudTasks,
  onRetryBackgroundTask,
  backgroundStats,
  syncingCloudTasks,
}: Props) {
  if (!tasks.length) {
    return (
      <div className="empty-state">
        <div className="empty-card">输入提示词后点击提交任务</div>
        <button type="button" className="ghost-btn small cloud-sync-empty" onClick={onSyncCloudTasks} disabled={syncingCloudTasks}>
          {syncingCloudTasks ? '同步中...' : '同步云端任务'}
        </button>
      </div>
    )
  }

  const hasFinished = tasks.some((task) => task.status !== 'running')

  return (
    <div className="task-queue">
      <div className="task-queue-toolbar">
        <span>
          {tasks.length} 个任务
          {backgroundStats ? ` · 今日 ${backgroundStats.todayGenerated} 张 · 累计 ${backgroundStats.totalGenerated} 张` : ''}
        </span>
        <div className="task-toolbar-actions">
          <button type="button" className="ghost-btn small" onClick={onSyncCloudTasks} disabled={syncingCloudTasks}>
            {syncingCloudTasks ? '同步中...' : '同步云端任务'}
          </button>
          <button type="button" className="ghost-btn small" onClick={onClearFinished} disabled={!hasFinished}>
            清理已结束
          </button>
        </div>
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
                <small>{formatTime(task.createdAt)} · {requestModeLabel(task)} · 并发 {task.concurrency} · {formatDuration(task.elapsedMs)}</small>
                {task.requestMode === 'background' && task.status === 'failed' ? (
                  <button type="button" className="ghost-btn small" onClick={() => onRetryBackgroundTask(task.cloudTaskId || task.id)}>重试后台任务</button>
                ) : null}
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
              ratio={task.ratio}
              resolution={task.resolution}
              size={task.size}
              onUploadImage={(result) => onUploadImage(task.id, result)}
              onUseAsReference={onUseAsReference}
              onMessage={onMessage}
            />
          </article>
        ))}
      </div>
    </div>
  )
}
