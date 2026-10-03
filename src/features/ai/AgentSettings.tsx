import { useEffect, useRef, useState, type FormEvent } from 'react'
import { providers, assistants, saveAssistant } from './api'
import type { Provider, Assistant } from './types'
import { Select } from '../../shared/ui/Select'
import { Icon } from '../../shared/ui/Icon'
import { errorMessage } from '../../shared/lib/errors'
import { useConfigSwitch } from './useConfigSwitch'
import { AssistantAvatar, AssistantIconPicker } from './AssistantAvatar'
import { ProviderLogo } from './ProviderLogo'

const emptyAssistant = {
  icon: 'lucide:bot',
  name: '',
  enabled: true,
  providerId: '',
  model: '',
  systemPrompt: '',
  fixedContext: '',
  maxOutputTokens: 1024,
  historyTurns: 6,
  maxContextChars: 131072,
  timeoutMs: 30000,
}

export function AgentSettings() {
  const [allProviders, setProviders] = useState<Provider[]>([])
  const [allAssistants, setAssistants] = useState<Assistant[]>([])
  const [assistantId, setAssistantId] = useState<string | null>(null)
  const [a, setA] = useState(emptyAssistant)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantDirty, setAssistantDirty] = useState(false)
  const assistantSection = useRef<HTMLElement>(null)

  async function refresh() {
    const [ps, as] = await Promise.all([providers(), assistants()])
    setProviders(ps)
    setAssistants(as)
  }
  useEffect(() => {
    void refresh().catch((e) => setNotice(errorMessage(e)))
  }, [])
  const { choose, dialog } = useConfigSwitch(busy)
  function editAssistant(value: Assistant) {
    setAssistantId(value.id)
    setA({
      icon: value.icon ?? 'lucide:bot',
      name: value.name,
      enabled: value.enabled,
      providerId: value.providerId,
      model: value.model,
      systemPrompt: value.systemPrompt,
      fixedContext: value.fixedContext,
      maxOutputTokens: value.generationOptions.maxOutputTokens,
      historyTurns: value.historyTurns,
      maxContextChars: value.maxContextChars,
      timeoutMs: value.timeoutMs,
    })
    setAssistantOpen(true)
    setAssistantDirty(false)
    setNotice('')
  }
  function createAssistant() {
    setAssistantId(null)
    setA({ ...emptyAssistant })
    setAssistantOpen(true)
    setAssistantDirty(false)
    setNotice('')
    assistantSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  function updateAssistant(patch: Partial<typeof a>) {
    setA((v) => ({ ...v, ...patch }))
    setAssistantDirty(true)
  }
  async function submitAssistant(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { maxOutputTokens, ...rest } = a
      const saved = await saveAssistant(assistantId, {
        ...rest,
        generationOptions: { maxOutputTokens },
      })
      editAssistant(saved)
      await refresh()
      setNotice('助手已保存。')
    } catch (e) {
      setNotice(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const selectedModels = allProviders.find((v) => v.id === a.providerId)?.models ?? []

  return (
    <main className="workspace studio-page management-page">
      <header className="studio-head dashboard-head">
        <div>
          <p className="eyebrow">AI STUDIO</p>
          <h1>助手管理</h1>
          <p>为不同任务创建助手，配置各自的模型和工作方式。</p>
        </div>
      </header>
      {notice && (
        <p className="notice dashboard-notice" role="status">
          {notice}
        </p>
      )}
      <div className="management-scroll agent-management-stack">
        <section
          className="dashboard-card entity-section"
          ref={assistantSection}
          aria-label="助手配置"
        >
          <div className="card-head">
            <div>
              <p className="eyebrow">YOUR ASSISTANTS</p>
              <h2>助手</h2>
              <p>选择模型，再告诉它应该怎样帮助你。</p>
            </div>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => choose(assistantDirty, '助手', createAssistant)}
            >
              <Icon name="plus" size={16} />
              新增助手
            </button>
          </div>
          <div className="entity-workspace">
            <div className="entity-list" aria-label="助手列表">
              {allAssistants.map((v) => (
                <button
                  disabled={busy}
                  className={`entity-row${assistantOpen && assistantId === v.id ? ' selected' : ''}`}
                  aria-pressed={assistantOpen && assistantId === v.id}
                  key={v.id}
                  onClick={() => choose(assistantDirty, '助手', () => editAssistant(v))}
                >
                  <span className="entity-avatar provider">
                    <AssistantAvatar icon={v.icon} />
                  </span>
                  <span className="entity-text">
                    <strong>{v.name}</strong>
                    <small>{v.model}</small>
                  </span>
                  <span
                    className={`entity-dot${v.enabled ? ' enabled' : ''}`}
                    title={v.enabled ? '已启用' : '已停用'}
                  />
                  <span className="sr-only">{v.enabled ? '已启用' : '已停用'}</span>
                </button>
              ))}
              {!allAssistants.length && (
                <p className="entity-list-empty">还没有助手，点击右上角创建。</p>
              )}
            </div>
            {!assistantOpen ? (
              <div className="entity-empty">
                <Icon name="assistant" size={30} />
                <h3>每项工作，都有合适的助手</h3>
                <p>选择已有助手，或创建一个新的助手。</p>
              </div>
            ) : (
              <form
                className="entity-detail fields"
                onSubmit={(event) => void submitAssistant(event)}
              >
                <fieldset disabled={busy} className="entity-form-fields">
                  <div className="entity-detail-heading">
                    <h3>{assistantId ? '编辑助手' : '新建助手'}</h3>
                    <label className="toggle-field">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) => updateAssistant({ enabled: e.target.checked })}
                      />
                      启用助手
                    </label>
                  </div>
                  <label>
                    助手名称
                    <input
                      required
                      maxLength={100}
                      placeholder="例如：写作搭档"
                      value={a.name}
                      onChange={(e) => updateAssistant({ name: e.target.value })}
                    />
                  </label>
                  <AssistantIconPicker
                    value={a.icon}
                    onChange={(icon) => updateAssistant({ icon })}
                  />
                  <div className="field-pair">
                    <Select
                      label="模型服务商"
                      value={a.providerId}
                      onChange={(id) =>
                        updateAssistant({
                          providerId: id,
                          model: allProviders.find((v) => v.id === id)?.models[0] ?? '',
                        })
                      }
                      options={[
                        { value: '', label: '请选择服务商' },
                        ...allProviders.map((v) => ({
                          value: v.id,
                          label: v.name + (v.enabled ? '' : '（停用）'),
                          icon: <ProviderLogo provider={v} size={18} />,
                        })),
                      ]}
                    />
                    <Select
                      label="助手模型"
                      value={a.model}
                      onChange={(model) => updateAssistant({ model })}
                      options={[
                        { value: '', label: '请选择模型' },
                        ...selectedModels.map((v) => ({ value: v, label: v })),
                      ]}
                    />
                  </div>
                  {!allProviders.length && (
                    <p className="settings-help">请先到网站管理最下方添加模型服务商。</p>
                  )}
                  <label>
                    身份与写作提示词
                    <textarea
                      required
                      rows={4}
                      placeholder="描述助手的职责、表达习惯和工作要求…"
                      value={a.systemPrompt}
                      onChange={(e) => updateAssistant({ systemPrompt: e.target.value })}
                    />
                  </label>
                  <label>
                    固定背景资料
                    <textarea
                      rows={3}
                      placeholder="可填写站点背景、常用术语或写作偏好。"
                      value={a.fixedContext}
                      onChange={(e) => updateAssistant({ fixedContext: e.target.value })}
                    />
                  </label>
                  <details className="assistant-advanced">
                    <summary>运行设置</summary>
                    <div className="field-pair">
                      <label>
                        最大输出 Token
                        <input
                          required
                          type="number"
                          min={128}
                          max={8192}
                          value={a.maxOutputTokens}
                          onChange={(e) =>
                            updateAssistant({ maxOutputTokens: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        保留完整对话轮数
                        <input
                          required
                          type="number"
                          min={0}
                          max={20}
                          value={a.historyTurns}
                          onChange={(e) =>
                            updateAssistant({ historyTurns: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        上下文字符预算
                        <input
                          required
                          type="number"
                          min={1024}
                          max={500000}
                          value={a.maxContextChars}
                          onChange={(e) =>
                            updateAssistant({ maxContextChars: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        执行超时（毫秒）
                        <input
                          required
                          type="number"
                          min={100}
                          max={120000}
                          value={a.timeoutMs}
                          onChange={(e) => updateAssistant({ timeoutMs: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  </details>
                </fieldset>
                <footer className="entity-form-actions">
                  <span>{assistantDirty ? '有未保存的修改' : '配置会用于后续对话'}</span>
                  <button
                    className="primary"
                    disabled={busy || !a.providerId || !selectedModels.includes(a.model)}
                  >
                    {busy ? '正在保存…' : '保存助手'}
                  </button>
                </footer>
              </form>
            )}
          </div>
        </section>
      </div>
      {dialog}
    </main>
  )
}
