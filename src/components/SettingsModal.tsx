import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { clearSettings, maskSecret } from '../lib/storage'
import { checkWorkerPassword } from '../lib/api'

interface Props {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onSave: (settings: AppSettings) => void
  onMessage: (message: string, type?: 'ok' | 'error') => void
}

export function SettingsModal({ open, settings, onClose, onSave, onMessage }: Props) {
  const [draft, setDraft] = useState(settings)
  const [showSecrets, setShowSecrets] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (open) setDraft(settings)
  }, [open, settings])

  if (!open) return null

  function save() {
    onSave(draft)
    onClose()
    onMessage('设置已保存到浏览器本地', 'ok')
  }

  async function testPassword() {
    setTesting(true)
    try {
      const result = await checkWorkerPassword(draft.accessPassword)
      onMessage(result.message, result.ok ? 'ok' : 'error')
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '测试失败', 'error')
    } finally {
      setTesting(false)
    }
  }

  function clearLocal() {
    clearSettings()
    onSave({ ...settings, apiKey: '', accessPassword: '' })
    onMessage('已清空浏览器内保存的配置', 'ok')
    onClose()
  }

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
        <header className="modal-header">
          <div>
            <h2>设置</h2>
            <p>API Key / URL / Worker 密码只保存在你的浏览器里。</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>×</button>
        </header>

        <div className="settings-grid">
          <div className="field full">
            <span>请求方式</span>
            <div className="request-mode-tabs">
              <button
                type="button"
                className={draft.requestMode === 'worker' ? 'active' : ''}
                onClick={() => setDraft((prev) => ({ ...prev, requestMode: 'worker' }))}
              >
                Worker 流式代理
              </button>
              <button
                type="button"
                className={draft.requestMode === 'background' ? 'active' : ''}
                onClick={() => setDraft((prev) => ({ ...prev, requestMode: 'background' }))}
              >
                Worker 后台任务
              </button>
              <button
                type="button"
                className={draft.requestMode === 'direct' ? 'active' : ''}
                onClick={() => setDraft((prev) => ({ ...prev, requestMode: 'direct' }))}
              >
                浏览器直连
              </button>
            </div>
            <small>
              流式代理可绕过 CORS 并 SSE 保活；后台任务适合 App 切后台，会把结果自动上传 PiXhost 并写入 D1；浏览器直连链路更短但上游必须允许 CORS。
            </small>
          </div>

          <label className="field full">
            <span>API URL</span>
            <input
              value={draft.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
            <small>填写 API 根地址，例如 <code>https://api.example.com/v1</code>。</small>
          </label>

          <label className="field full">
            <span>API Key</span>
            <input
              type={showSecrets ? 'text' : 'password'}
              value={draft.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            />
            <small>当前：{maskSecret(draft.apiKey)}</small>
          </label>

          <label className="field full">
            <span>Worker 访问密码</span>
            <div className="inline-input">
              <input
                type={showSecrets ? 'text' : 'password'}
                value={draft.accessPassword}
                placeholder="wrangler.jsonc 里的 ACCESS_PASSWORD"
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, accessPassword: e.target.value })}
              />
              <button type="button" className="secondary-btn" onClick={testPassword} disabled={testing}>
                {testing ? '测试中' : '测试'}
              </button>
            </div>
            <small>
              Worker 流式代理 / 后台任务需要。密码在 Worker 环境变量 <code>ACCESS_PASSWORD</code> 里改。
            </small>
          </label>

          <label className="field">
            <span>默认模型</span>
            <input
              value={draft.model}
              placeholder="gpt-image-2"
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>

          <label className="field">
            <span>超时时间（秒）</span>
            <input
              type="number"
              min={10}
              max={900}
              value={draft.timeoutSec}
              onChange={(e) => setDraft({ ...draft, timeoutSec: Number(e.target.value) })}
            />
          </label>

          <label className="field">
            <span>默认生成张数</span>
            <input
              type="number"
              min={1}
              max={12}
              value={draft.count}
              onChange={(e) => setDraft({ ...draft, count: Number(e.target.value) })}
            />
          </label>

          <label className="field">
            <span>并发数</span>
            <input
              type="number"
              min={1}
              max={6}
              value={draft.concurrency}
              onChange={(e) => setDraft({ ...draft, concurrency: Number(e.target.value) })}
            />
          </label>

          <label className="check-field full">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => setShowSecrets(e.target.checked)}
            />
            显示密钥和密码
          </label>

          <label className="check-field full">
            <input
              type="checkbox"
              checked={draft.autoUploadPixhost}
              onChange={(e) => setDraft({ ...draft, autoUploadPixhost: e.target.checked })}
            />
            生成成功后自动上传到 PiXhost 图床，结果图悬浮时可复制 URL
          </label>
          <small className="settings-note full">
            自动上传会把生成图片发送到第三方图床；后台任务模式下结果始终会自动上传并只保存图床直链。
          </small>

          <label className="check-field full">
            <input
              type="checkbox"
              checked={draft.rememberSecrets}
              onChange={(e) => setDraft({ ...draft, rememberSecrets: e.target.checked })}
            />
            长期保存到 localStorage；关闭后只保存到当前会话 sessionStorage
          </label>
        </div>

        <footer className="modal-actions">
          <button type="button" className="ghost-btn danger" onClick={clearLocal}>清空本地配置</button>
          <div className="spacer" />
          <button type="button" className="ghost-btn" onClick={onClose}>取消</button>
          <button type="button" className="primary-btn" onClick={save}>保存</button>
        </footer>
      </section>
    </div>
  )
}

