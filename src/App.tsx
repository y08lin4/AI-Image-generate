import { useEffect, useState } from 'react'
import type { AppSettings, AspectRatio, GenerationTask, GenerateResultItem, HistoryItem, InputImage, Mode, ResolutionTier } from './types'
import { RatioPicker } from './components/RatioPicker'
import { ResolutionPicker } from './components/ResolutionPicker'
import { ImageUploader } from './components/ImageUploader'
import { SettingsModal } from './components/SettingsModal'
import { HistoryPanel } from './components/HistoryPanel'
import { TaskQueue } from './components/TaskQueue'
import { createId, generateImagesDirect, generateImagesStream } from './lib/api'
import { addHistory, clearHistory, deleteHistory, getHistory } from './lib/db'
import { getImageSize, getResolutionLabel } from './lib/ratios'
import { DEFAULT_SETTINGS, loadSettings, maskSecret, saveSettings } from './lib/storage'
import './styles.css'

type Message = { text: string; type: 'ok' | 'error' | 'info' } | null

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('text-to-image')
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState<AspectRatio>(() => loadSettings().defaultRatio)
  const [resolution, setResolution] = useState<ResolutionTier>(() => loadSettings().defaultResolution)
  const [inputImages, setInputImages] = useState<InputImage[]>([])
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [message, setMessage] = useState<Message>(null)

  useEffect(() => {
    void refreshHistory()
  }, [])

  useEffect(() => {
    setRatio(settings.defaultRatio)
  }, [settings.defaultRatio])

  useEffect(() => {
    setResolution(settings.defaultResolution)
  }, [settings.defaultResolution])

  function showMessage(text: string, type: 'ok' | 'error' | 'info' = 'info') {
    setMessage({ text, type })
  }

  function patchSettings(patch: Partial<AppSettings>) {
    updateSettings({ ...settings, ...patch })
  }

  function patchTask(id: string, patch: Partial<GenerationTask>) {
    setTasks((prev) => prev.map((task) => task.id === id ? { ...task, ...patch } : task))
  }

  function updateTaskResult(taskId: string, result: GenerateResultItem) {
    setTasks((prev) => prev.map((task) => {
      if (task.id !== taskId) return task
      const nextResults = [...task.results]
      nextResults[result.index] = result
      return { ...task, results: nextResults.filter(Boolean) }
    }))
  }

  function updateSettings(next: AppSettings) {
    const normalized = {
      ...DEFAULT_SETTINGS,
      ...next,
      count: Math.max(1, Math.min(12, Math.round(Number(next.count) || DEFAULT_SETTINGS.count))),
      concurrency: Math.max(1, Math.min(6, Math.round(Number(next.concurrency) || DEFAULT_SETTINGS.concurrency))),
      timeoutSec: Math.max(10, Math.min(900, Math.round(Number(next.timeoutSec) || DEFAULT_SETTINGS.timeoutSec))),
      defaultRatio: next.defaultRatio,
      defaultResolution: next.defaultResolution,
    }
    setSettings(normalized)
    saveSettings(normalized)
  }

  async function refreshHistory() {
    setHistory(await getHistory())
  }

  function validateBeforeGenerate() {
    if (settings.requestMode === 'worker' && !settings.accessPassword.trim()) return '请先在设置里填写 Worker 访问密码'
    if (!settings.baseUrl.trim()) return '请先填写 API URL'
    if (!settings.apiKey.trim()) return '请先填写 API Key'
    if (!settings.model.trim()) return '请先填写模型名称'
    if (!prompt.trim()) return '请输入提示词'
    if (mode === 'image-to-image' && inputImages.length === 0) return '图生图模式需要先上传参考图'
    return ''
  }

  function handleGenerate() {
    const invalid = validateBeforeGenerate()
    if (invalid) {
      showMessage(invalid, 'error')
      setSettingsOpen(true)
      return
    }

    setMessage(null)
    updateSettings(settings)

    const startedAt = Date.now()
    const taskId = createId('task')
    const payload = {
      mode,
      prompt: prompt.trim(),
      ratio,
      resolution,
      model: settings.model.trim(),
      baseUrl: settings.baseUrl.trim(),
      apiKey: settings.apiKey.trim(),
      timeoutSec: settings.timeoutSec,
      count: settings.count,
      concurrency: settings.concurrency,
      inputImages: mode === 'image-to-image' ? inputImages.map((image) => ({ ...image })) : [],
    }

    const task: GenerationTask = {
      id: taskId,
      createdAt: startedAt,
      mode,
      requestMode: settings.requestMode,
      prompt: payload.prompt,
      ratio,
      resolution,
      size,
      model: payload.model,
      count: payload.count,
      concurrency: payload.concurrency,
      status: 'running',
      results: [],
    }
    setTasks((prev) => [task, ...prev])
    showMessage('任务已提交，可以继续提交新任务', 'ok')
    void runGenerationTask(taskId, payload, settings.requestMode, settings.accessPassword, startedAt)
  }

  async function runGenerationTask(
    taskId: string,
    payload: {
      mode: Mode
      prompt: string
      ratio: AspectRatio
      resolution: ResolutionTier
      model: string
      baseUrl: string
      apiKey: string
      timeoutSec: number
      count: number
      concurrency: number
      inputImages: InputImage[]
    },
    requestMode: AppSettings['requestMode'],
    accessPassword: string,
    startedAt: number,
  ) {
    try {
      let lastPingAt = 0
      const response = requestMode === 'direct'
        ? await generateImagesDirect(payload, (result) => updateTaskResult(taskId, result))
        : await generateImagesStream(payload, accessPassword, (event) => {
            if (event.event === 'result') updateTaskResult(taskId, event.data)
            if (event.event === 'ping' && Date.now() - lastPingAt > 30_000) {
              lastPingAt = Date.now()
              showMessage('Worker 代理连接保持中...', 'info')
            }
          })

      const okImages = response.results.filter((item) => item.ok && item.image).map((item) => item.image!)
      const failedCount = response.results.length - okImages.length

      patchTask(taskId, {
        status: 'completed',
        results: response.results,
        elapsedMs: response.elapsedMs,
      })

      if (okImages.length) {
        await addHistory({
          id: taskId,
          createdAt: startedAt,
          mode: payload.mode,
          prompt: payload.prompt,
          ratio: payload.ratio,
          resolution: payload.resolution,
          size: response.size,
          model: response.model,
          images: okImages,
          failedCount,
          elapsedMs: response.elapsedMs,
        })
        await refreshHistory()
      }

      showMessage(
        failedCount ? `任务完成 ${okImages.length} 张，失败 ${failedCount} 张` : `任务成功生成 ${okImages.length} 张图片`,
        failedCount ? 'info' : 'ok',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败'
      patchTask(taskId, {
        status: 'failed',
        error: message,
        elapsedMs: Date.now() - startedAt,
      })
      showMessage(message, 'error')
    }
  }

  function handleUseAsReference(dataUrl: string) {
    const nextImage = {
      id: createId('ref'),
      name: 'generated-reference.png',
      type: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png',
      dataUrl,
      size: dataUrl.length,
    }
    setInputImages((prev) => {
      if (prev.length >= 8) {
        showMessage('参考图最多 8 张，已替换为当前图片', 'info')
        return [nextImage]
      }
      return [...prev, nextImage]
    })
    setMode('image-to-image')
    showMessage('已放入图生图参考图', 'ok')
  }

  async function handleDeleteHistory(id: string) {
    await deleteHistory(id)
    await refreshHistory()
  }

  async function handleClearHistory() {
    if (!confirm('确认清空本地历史记录？')) return
    await clearHistory()
    await refreshHistory()
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }

  function clearFinishedTasks() {
    setTasks((prev) => prev.filter((task) => task.status === 'running'))
  }

  const size = getImageSize(ratio, resolution)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <h1>AI Image Generate</h1>
            <p>自定义 URL / Key 的私人生图工作台</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="config-pill" title={settings.baseUrl}>
            <span>{settings.model || '未设置模型'}</span>
            <small>{settings.requestMode === 'worker' ? 'Worker 代理' : '浏览器直连'} · {maskSecret(settings.apiKey)}</small>
          </div>
          <button type="button" className="secondary-btn" onClick={() => setSettingsOpen(true)}>设置</button>
        </div>
      </header>

      {message ? (
        <div className={`toast ${message.type}`}>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>×</button>
        </div>
      ) : null}

      <main className="workspace">
        <aside className="sidebar">
          <section className="panel">
            <label className="label">模式</label>
            <div className="mode-tabs">
              <button type="button" className={mode === 'text-to-image' ? 'active' : ''} onClick={() => setMode('text-to-image')}>文生图</button>
              <button type="button" className={mode === 'image-to-image' ? 'active' : ''} onClick={() => setMode('image-to-image')}>图生图</button>
            </div>
          </section>

          <section className="panel">
            <label className="label" htmlFor="prompt">提示词</label>
            <textarea
              id="prompt"
              className="prompt-input"
              placeholder={mode === 'text-to-image' ? '描述你想生成的内容...' : '描述你希望如何修改这张图...'}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </section>

          {mode === 'image-to-image' ? (
            <section className="panel">
              <label className="label">参考图片</label>
              <ImageUploader images={inputImages} onChange={setInputImages} onError={(text) => showMessage(text, 'error')} />
            </section>
          ) : null}

          <section className="panel">
            <label className="label">模型</label>
            <input
              className="text-input"
              value={settings.model}
              onChange={(e) => patchSettings({ model: e.target.value })}
              placeholder="gpt-image-2"
            />
          </section>

          <section className="panel">
            <div className="label-row">
              <label className="label">比例</label>
              <span>{ratio === 'auto' ? '自动' : ratio}</span>
            </div>
            <RatioPicker
              value={ratio}
              onChange={(next) => {
                setRatio(next)
                patchSettings({ defaultRatio: next })
              }}
            />
          </section>

          <section className="panel">
            <div className="label-row">
              <label className="label">分辨率档位</label>
              <span>{size}</span>
            </div>
            <ResolutionPicker
              value={resolution}
              onChange={(next) => {
                setResolution(next)
                patchSettings({ defaultResolution: next })
              }}
            />
            <small className="hint-text">比例或分辨率选「自动」时不传 size，由上游模型自行决定。</small>
          </section>

          <section className="panel split-2">
            <label className="field compact">
              <span>张数</span>
              <input type="number" min={1} max={12} value={settings.count} onChange={(e) => patchSettings({ count: Number(e.target.value) })} />
            </label>
            <label className="field compact">
              <span>超时</span>
              <input type="number" min={10} max={900} value={settings.timeoutSec} onChange={(e) => patchSettings({ timeoutSec: Number(e.target.value) })} />
            </label>
          </section>

          <button type="button" className="generate-btn" onClick={handleGenerate}>
            提交任务（{settings.count} 张）
          </button>
        </aside>

        <section className="canvas-area">
          <div className="canvas-header">
            <div>
              <h2>生成结果</h2>
              <p>{mode === 'image-to-image' ? '图生图' : '文生图'} · {ratio} · {getResolutionLabel(resolution)} · {size} · {settings.requestMode === 'worker' ? 'Worker 流式代理' : '浏览器直连'} · 并发 {settings.concurrency}</p>
            </div>
          </div>
          <TaskQueue
            tasks={tasks}
            onUseAsReference={handleUseAsReference}
            onMessage={showMessage}
            onRemove={removeTask}
            onClearFinished={clearFinishedTasks}
          />
        </section>

        <HistoryPanel
          items={history}
          onReusePrompt={(value) => {
            setPrompt(value)
            showMessage('提示词已复用', 'ok')
          }}
          onUseImage={handleUseAsReference}
          onDelete={handleDeleteHistory}
          onClear={handleClearHistory}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={updateSettings}
        onMessage={showMessage}
      />
    </div>
  )
}

