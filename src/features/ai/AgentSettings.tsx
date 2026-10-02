import { useEffect, useRef, useState, type FormEvent } from 'react'
import { providers, assistants, saveProvider, saveAssistant, testProvider } from './api'
import type { Provider, Assistant } from './types'
import { Select } from '../../shared/components/Select'
import { Icon } from '../../shared/components/Icon'
import { errorMessage } from '../../shared/errors'

const emptyProvider = { name: '', enabled: true, baseUrl: '', models: [] as string[] }
const emptyAssistant = { name: '', enabled: true, providerId: '', model: '', systemPrompt: '', fixedContext: '', maxOutputTokens: 1024, historyTurns: 6, maxContextChars: 131072, timeoutMs: 30000 }

export function AgentSettings() {
  const [allProviders, setProviders] = useState<Provider[]>([])
  const [allAssistants, setAssistants] = useState<Assistant[]>([])
  const [providerId, setProviderId] = useState<string | null>(null)
  const [assistantId, setAssistantId] = useState<string | null>(null)
  const [p, setP] = useState(emptyProvider)
  const [a, setA] = useState(emptyAssistant)
  const [key, setKey] = useState('')
  const [keyAction, setKeyAction] = useState('replace')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [testModel, setTestModel] = useState('')
  const [newModel, setNewModel] = useState('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [providerDirty, setProviderDirty] = useState(false)
  const [assistantDirty, setAssistantDirty] = useState(false)
  const [pendingChoice, setPendingChoice] = useState<{ label: string; action: () => void } | null>(null)
  const cancelChoice = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const providerSection = useRef<HTMLElement>(null)
  const assistantSection = useRef<HTMLElement>(null)

  async function refresh() {
    const [ps, as] = await Promise.all([providers(), assistants()])
    setProviders(ps); setAssistants(as)
  }
  useEffect(() => { void refresh().catch(e => setNotice(errorMessage(e))) }, [])
  useEffect(() => { if (pendingChoice) cancelChoice.current?.focus() }, [pendingChoice])
  function choose(dirty: boolean, label: string, action: () => void) {
    if (busy) return
    if (dirty) { returnFocus.current = document.activeElement as HTMLElement; setPendingChoice({ label, action }) }
    else action()
  }
  function closeChoice() { setPendingChoice(null); returnFocus.current?.focus() }
  function editProvider(value: Provider) {
    setProviderId(value.id); setP({ name: value.name, enabled: value.enabled, baseUrl: value.baseUrl, models: [...value.models] })
    setKey(''); setKeyAction('retain'); setTestModel(value.models[0] ?? ''); setNewModel(''); setProviderOpen(true); setProviderDirty(false); setNotice('')
  }
  function editAssistant(value: Assistant) {
    setAssistantId(value.id); setA({ name: value.name, enabled: value.enabled, providerId: value.providerId, model: value.model, systemPrompt: value.systemPrompt, fixedContext: value.fixedContext, maxOutputTokens: value.generationOptions.maxOutputTokens, historyTurns: value.historyTurns, maxContextChars: value.maxContextChars, timeoutMs: value.timeoutMs })
    setAssistantOpen(true); setAssistantDirty(false); setNotice('')
  }
  function createProvider() {
    setProviderId(null); setP({ ...emptyProvider, models: [] }); setKey(''); setKeyAction('replace'); setTestModel(''); setNewModel(''); setProviderOpen(true); setProviderDirty(false); setNotice('')
    providerSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  function createAssistant() {
    setAssistantId(null); setA({ ...emptyAssistant }); setAssistantOpen(true); setAssistantDirty(false); setNotice('')
    assistantSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  function updateProvider(patch: Partial<typeof p>) { setP(v => ({ ...v, ...patch })); setProviderDirty(true) }
  function updateAssistant(patch: Partial<typeof a>) { setA(v => ({ ...v, ...patch })); setAssistantDirty(true) }
  function addModel() {
    const model = newModel.trim()
    if (!model) return
    if (p.models.includes(model)) { setNotice('这个模型 ID 已经在列表中。'); return }
    updateProvider({ models: [...p.models, model] }); setNewModel(''); setNotice('')
  }
  async function submitProvider(event: FormEvent) {
    event.preventDefault()
    if (newModel.trim()) { setNotice('请先添加输入的模型 ID，再保存服务商。'); return }
    const models = p.models.map(v => v.trim())
    if (!models.length || models.some(v => !v) || new Set(models).size !== models.length) { setNotice('请填写至少一个模型 ID，模型 ID 不能为空或重复。'); return }
    setBusy(true)
    try {
      const saved = await saveProvider(providerId, { ...p, models, type: 'openai-compatible', apiKeyAction: keyAction, ...(keyAction === 'replace' ? { apiKey: key } : {}) })
      editProvider(saved); await refresh(); setNotice('服务商已保存。')
    } catch (e) { setNotice(errorMessage(e)) } finally { setBusy(false) }
  }
  async function submitAssistant(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      const { maxOutputTokens, ...rest } = a
      const saved = await saveAssistant(assistantId, { ...rest, generationOptions: { maxOutputTokens } })
      editAssistant(saved); await refresh(); setNotice('助手已保存。')
    } catch (e) { setNotice(errorMessage(e)) } finally { setBusy(false) }
  }
  async function test() {
    if (!providerId || providerDirty) return
    setBusy(true)
    try {
      const result = await testProvider(providerId, testModel)
      setNotice(`聊天连接：${result.connection.ok ? '通过' : '失败（' + result.connection.error + '）'}；工具调用：${result.tools.ok ? '通过' : '未通过（' + result.tools.error + '）'}。耗时 ${result.durationMs} ms。`)
    } catch (e) { setNotice(errorMessage(e)) } finally { setBusy(false) }
  }
  const savedProvider = allProviders.find(v => v.id === providerId)
  const selectedModels = allProviders.find(v => v.id === a.providerId)?.models ?? []

  return <main className="workspace studio-page management-page">
    <header className="studio-head dashboard-head"><div><p className="eyebrow">AI STUDIO</p><h1>助手管理</h1><p>为不同任务创建助手，统一管理模型连接。</p></div></header>
    {notice && <p className="notice dashboard-notice" role="status">{notice}</p>}
    <div className="management-scroll agent-management-stack">
      <section className="dashboard-card entity-section" ref={assistantSection} aria-label="助手配置">
        <div className="card-head"><div><p className="eyebrow">YOUR ASSISTANTS</p><h2>助手</h2><p>选择模型，再告诉它应该怎样帮助你。</p></div><button className="secondary-button" disabled={busy} onClick={() => choose(assistantDirty, '助手', createAssistant)}><Icon name="plus" size={16} />新增助手</button></div>
        <div className="entity-workspace">
          <div className="entity-list" aria-label="助手列表">
            {allAssistants.map(v => <button disabled={busy} className={`entity-row${assistantOpen && assistantId === v.id ? ' selected' : ''}`} aria-pressed={assistantOpen && assistantId === v.id} key={v.id} onClick={() => choose(assistantDirty, '助手', () => editAssistant(v))}>
              <span className="entity-avatar"><Icon name="assistant" /></span><span className="entity-text"><strong>{v.name}</strong><small>{v.model}</small></span><span className={`entity-dot${v.enabled ? ' enabled' : ''}`} title={v.enabled ? '已启用' : '已停用'} /><span className="sr-only">{v.enabled ? '已启用' : '已停用'}</span>
            </button>)}
            {!allAssistants.length && <p className="entity-list-empty">还没有助手，点击右上角创建。</p>}
          </div>
          {!assistantOpen ? <div className="entity-empty"><Icon name="assistant" size={30} /><h3>每项工作，都有合适的助手</h3><p>选择已有助手，或创建一个新的助手。</p></div> : <form className="entity-detail fields" onSubmit={event => void submitAssistant(event)}>
            <fieldset disabled={busy} className="entity-form-fields">
              <div className="entity-detail-heading"><h3>{assistantId ? '编辑助手' : '新建助手'}</h3><label className="toggle-field"><input type="checkbox" checked={a.enabled} onChange={e => updateAssistant({ enabled: e.target.checked })} />启用助手</label></div>
              <label>助手名称<input required maxLength={100} placeholder="例如：写作搭档" value={a.name} onChange={e => updateAssistant({ name: e.target.value })} /></label>
              <div className="field-pair">
                <Select label="模型服务商" value={a.providerId} onChange={id => updateAssistant({ providerId: id, model: allProviders.find(v => v.id === id)?.models[0] ?? '' })} options={[{ value: '', label: '请选择服务商' }, ...allProviders.map(v => ({ value: v.id, label: v.name + (v.enabled ? '' : '（停用）') }))]} />
                <Select label="助手模型" value={a.model} onChange={model => updateAssistant({ model })} options={[{ value: '', label: '请选择模型' }, ...selectedModels.map(v => ({ value: v, label: v }))]} />
              </div>
              {!allProviders.length && <p className="settings-help">先在下方添加模型服务商。</p>}
              <label>身份与写作提示词<textarea required rows={4} placeholder="描述助手的职责、表达习惯和工作要求…" value={a.systemPrompt} onChange={e => updateAssistant({ systemPrompt: e.target.value })} /></label>
              <label>固定背景资料<textarea rows={3} placeholder="可填写站点背景、常用术语或写作偏好。" value={a.fixedContext} onChange={e => updateAssistant({ fixedContext: e.target.value })} /></label>
              <details className="assistant-advanced"><summary>运行设置</summary><div className="field-pair">
                <label>最大输出 Token<input required type="number" min={128} max={8192} value={a.maxOutputTokens} onChange={e => updateAssistant({ maxOutputTokens: Number(e.target.value) })} /></label>
                <label>保留完整对话轮数<input required type="number" min={0} max={20} value={a.historyTurns} onChange={e => updateAssistant({ historyTurns: Number(e.target.value) })} /></label>
                <label>上下文字符预算<input required type="number" min={1024} max={500000} value={a.maxContextChars} onChange={e => updateAssistant({ maxContextChars: Number(e.target.value) })} /></label>
                <label>执行超时（毫秒）<input required type="number" min={100} max={120000} value={a.timeoutMs} onChange={e => updateAssistant({ timeoutMs: Number(e.target.value) })} /></label>
              </div></details>
            </fieldset>
            <footer className="entity-form-actions"><span>{assistantDirty ? '有未保存的修改' : '配置会用于后续对话'}</span><button className="primary" disabled={busy || !a.providerId || !selectedModels.includes(a.model)}>{busy ? '正在保存…' : '保存助手'}</button></footer>
          </form>}
        </div>
      </section>
      <section className="dashboard-card entity-section" ref={providerSection} aria-label="模型服务商配置">
        <div className="card-head"><div><p className="eyebrow">MODEL CONNECTIONS</p><h2>模型服务商</h2><p>一个连接，管理多个模型。</p></div><button className="secondary-button" disabled={busy} onClick={() => choose(providerDirty || !!newModel.trim(), '服务商', createProvider)}><Icon name="plus" size={16} />新增服务商</button></div>
        <div className="entity-workspace">
          <div className="entity-list" aria-label="服务商列表">
            {allProviders.map(v => <button disabled={busy} className={`entity-row${providerOpen && providerId === v.id ? ' selected' : ''}`} aria-pressed={providerOpen && providerId === v.id} key={v.id} onClick={() => choose(providerDirty || !!newModel.trim(), '服务商', () => editProvider(v))}>
              <span className="entity-avatar provider"><Icon name="server" /></span><span className="entity-text"><strong>{v.name}</strong><small>{v.models.length} 个模型 · {v.hasApiKey ? '密钥已配置' : '未配置密钥'}</small></span><span className={`entity-dot${v.enabled ? ' enabled' : ''}`} title={v.enabled ? '已启用' : '已停用'} /><span className="sr-only">{v.enabled ? '已启用' : '已停用'}</span>
            </button>)}
            {!allProviders.length && <p className="entity-list-empty">添加一个服务商，连接你的模型。</p>}
          </div>
          {!providerOpen ? <div className="entity-empty"><Icon name="server" size={30} /><h3>连接你的模型</h3><p>配置服务地址、密钥和模型 ID。</p></div> : <form className="entity-detail fields" onSubmit={event => void submitProvider(event)}>
            <fieldset disabled={busy} className="entity-form-fields">
              <div className="entity-detail-heading"><div><h3>{providerId ? '编辑服务商' : '新建服务商'}</h3><span className="protocol-label">OpenAI 兼容接口</span></div><label className="toggle-field"><input type="checkbox" checked={p.enabled} onChange={e => updateProvider({ enabled: e.target.checked })} />启用服务商</label></div>
              <label>服务商名称<input required maxLength={100} value={p.name} placeholder="为这个连接起一个名字" onChange={e => updateProvider({ name: e.target.value })} /></label>
              <label>API 地址<input required type="url" value={p.baseUrl} placeholder="https://api.example.com/v1" onChange={e => updateProvider({ baseUrl: e.target.value })} /></label>
              <Select label="密钥操作" value={keyAction} onChange={action => { setKeyAction(action); setKey(''); setProviderDirty(true) }} options={[...(providerId ? [{ value: 'retain', label: '保留已保存密钥' }] : []), { value: 'replace', label: '设置或替换密钥' }, { value: 'clear', label: '不使用密钥 / 清除已保存密钥' }]} />
              {keyAction === 'replace' ? <label>API Key<input type="password" autoComplete="new-password" required value={key} placeholder="输入 API Key" onChange={e => { setKey(e.target.value); setProviderDirty(true) }} /></label> : <p className="field-hint">{keyAction === 'clear' ? '保存后，此连接不使用密钥。' : savedProvider?.hasApiKey ? '已保存的密钥会保留，页面不会读取明文。' : '此连接尚未保存密钥。'}</p>}
              <div className="model-editor"><div className="models-heading"><h4>模型</h4><span>{p.models.length} 个</span></div>
                {p.models.map((model, index) => <div className="model-row" key={index}><input aria-label={`模型 ID ${index + 1}`} required value={model} onChange={e => updateProvider({ models: p.models.map((v, n) => n === index ? e.target.value : v) })} /><button type="button" className="icon-button" aria-label={`移除模型 ${index + 1}`} onClick={() => updateProvider({ models: p.models.filter((_, n) => n !== index) })}><Icon name="close" size={16} /></button></div>)}
                <div className="model-add"><input aria-label="新模型 ID" value={newModel} placeholder="填写 API 模型 ID" onChange={e => setNewModel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addModel() } }} /><button className="secondary-button" type="button" disabled={!newModel.trim()} onClick={addModel}><Icon name="plus" size={15} />添加模型</button></div>
                <p className="field-hint">填写服务商接受的准确模型 ID，保存后即可在助手中选择。</p>
              </div>
            </fieldset>
            <footer className="entity-form-actions"><span>{providerDirty ? '有未保存的修改' : savedProvider?.hasApiKey ? '密钥已配置' : '尚未保存密钥'}</span><button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存服务商'}</button></footer>
            {providerId && <div className="provider-test"><Select label="测试模型" value={testModel} onChange={setTestModel} options={(savedProvider?.models ?? []).map(v => ({ value: v, label: v }))} /><button type="button" className="secondary-button" disabled={busy || !testModel || providerDirty || !!newModel.trim()} onClick={() => void test()}>测试连接与工具</button>{providerDirty && <p className="field-hint">先保存修改，再测试连接。</p>}</div>}
          </form>}
        </div>
      </section>
    </div>
    {pendingChoice && <div className="management-dialog-backdrop"><section className="management-dialog" role="dialog" aria-modal="true" aria-labelledby="switch-config-title" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); closeChoice() }
      if (event.key === 'Tab') {
        const items = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
        const next = event.shiftKey ? items[0] : items[items.length - 1]
        if (document.activeElement === next) { event.preventDefault(); (event.shiftKey ? items[items.length - 1] : items[0])?.focus() }
      }
    }}><h2 id="switch-config-title">保留当前修改？</h2><p>当前{pendingChoice.label}有未保存的修改，继续切换会放弃这些修改。</p><div className="actions"><button ref={cancelChoice} onClick={closeChoice}>返回编辑</button><button className="primary" onClick={() => { pendingChoice.action(); closeChoice() }}>放弃修改并切换</button></div></section></div>}
  </main>
}
