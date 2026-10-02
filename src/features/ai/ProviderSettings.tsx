import { useEffect, useRef, useState, type FormEvent } from 'react'
import { providers, saveProvider, testProvider } from './api'
import type { Provider } from './types'
import { Select } from '../../shared/components/Select'
import { Icon } from '../../shared/components/Icon'
import { errorMessage } from '../../shared/errors'
import { useConfigSwitch } from './useConfigSwitch'
import { ProviderLogo } from './ProviderLogo'

const emptyProvider = { name: '', enabled: true, baseUrl: '', models: [] as string[] }

export function ProviderSettings() {
  const [allProviders, setProviders] = useState<Provider[]>([])
  const [providerId, setProviderId] = useState<string | null>(null)
  const [p, setP] = useState(emptyProvider)
  const [key, setKey] = useState('')
  const [keyAction, setKeyAction] = useState('replace')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [testModel, setTestModel] = useState('')
  const [newModel, setNewModel] = useState('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [providerDirty, setProviderDirty] = useState(false)
  const providerSection = useRef<HTMLElement>(null)
  const { choose, dialog } = useConfigSwitch(busy)
  async function refresh() { setProviders(await providers()) }
  useEffect(() => { void refresh().catch(e => setNotice(errorMessage(e))) }, [])
  function editProvider(value: Provider) {
    setProviderId(value.id); setP({ name: value.name, enabled: value.enabled, baseUrl: value.baseUrl, models: [...value.models] })
    setKey(''); setKeyAction('retain'); setTestModel(value.models[0] ?? ''); setNewModel(''); setProviderOpen(true); setProviderDirty(false); setNotice('')
  }
  function createProvider() {
    setProviderId(null); setP({ ...emptyProvider, models: [] }); setKey(''); setKeyAction('replace'); setTestModel(''); setNewModel(''); setProviderOpen(true); setProviderDirty(false); setNotice('')
    providerSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  function updateProvider(patch: Partial<typeof p>) { setP(v => ({ ...v, ...patch })); setProviderDirty(true) }
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
  async function test() {
    if (!providerId || providerDirty) return
    setBusy(true)
    try {
      const result = await testProvider(providerId, testModel)
      setNotice(`聊天连接：${result.connection.ok ? '通过' : '失败（' + result.connection.error + '）'}；工具调用：${result.tools.ok ? '通过' : '未通过（' + result.tools.error + '）'}。耗时 ${result.durationMs} ms。`)
    } catch (e) { setNotice(errorMessage(e)) } finally { setBusy(false) }
  }
  const savedProvider = allProviders.find(v => v.id === providerId)

  return <>
      <section className="dashboard-card entity-section" ref={providerSection} aria-label="模型服务商配置">
        <div className="card-head"><div><p className="eyebrow">MODEL CONNECTIONS</p><h2>模型服务商</h2><p>一个连接，管理多个模型。</p></div><button className="secondary-button" disabled={busy} onClick={() => choose(providerDirty || !!newModel.trim(), '服务商', createProvider)}><Icon name="plus" size={16} />新增服务商</button></div>
        {notice && <p className="notice provider-notice" role="status">{notice}</p>}
        <div className="entity-workspace">
          <div className="entity-list" aria-label="服务商列表">
            {allProviders.map(v => <button disabled={busy} className={`entity-row${providerOpen && providerId === v.id ? ' selected' : ''}`} aria-pressed={providerOpen && providerId === v.id} key={v.id} onClick={() => choose(providerDirty || !!newModel.trim(), '服务商', () => editProvider(v))}>
              <span className="entity-avatar provider"><ProviderLogo provider={v} /></span><span className="entity-text"><strong>{v.name}</strong><small>{v.models.length} 个模型 · {v.hasApiKey ? '密钥已配置' : '未配置密钥'}</small></span><span className={`entity-dot${v.enabled ? ' enabled' : ''}`} title={v.enabled ? '已启用' : '已停用'} /><span className="sr-only">{v.enabled ? '已启用' : '已停用'}</span>
            </button>)}
            {!allProviders.length && <p className="entity-list-empty">添加一个服务商，连接你的模型。</p>}
          </div>
          {!providerOpen ? <div className="entity-empty"><Icon name="server" size={30} /><h3>连接你的模型</h3><p>配置服务地址、密钥和模型 ID。</p></div> : <form className="entity-detail fields" onSubmit={event => void submitProvider(event)}>
            <fieldset disabled={busy} className="entity-form-fields">
              <div className="entity-detail-heading"><div className="provider-detail-title"><span className="entity-avatar provider"><ProviderLogo provider={p} /></span><div><h3>{providerId ? '编辑服务商' : '新建服务商'}</h3><span className="protocol-label">OpenAI 兼容接口</span></div></div><label className="toggle-field"><input type="checkbox" checked={p.enabled} onChange={e => updateProvider({ enabled: e.target.checked })} />启用服务商</label></div>
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
    {dialog}
  </>
}
