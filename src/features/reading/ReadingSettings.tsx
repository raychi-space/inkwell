import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../../shared/lib/errors'
import type { Assistant, Provider } from '../../shared/types/ai'
import {
  createAssistantFromTemplate,
  createReadingSource,
  deleteReadingSource,
  loadReadingDependencies,
  readingShelf,
  saveReadingSettings,
  saveReadingSource,
  syncReadingSource,
} from './api'
import type { AssistantTemplate, ReadingShelf, ReadingSource, ReadingSourceInput } from './types'

const emptySource: ReadingSourceInput = {
  name: '',
  description: '',
  siteUrl: 'https://developers.openai.com/blog',
  listingUrl: 'https://developers.openai.com/blog',
  adapter: 'OPENAI_DEVELOPERS',
  enabled: true,
  position: 30,
}

export function ReadingSettings({ onOpenAssistants }: { onOpenAssistants: () => void }) {
  const [shelf, setShelf] = useState<ReadingShelf | null>(null)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [templates, setTemplates] = useState<AssistantTemplate[]>([])
  const [drafts, setDrafts] = useState<Record<string, ReadingSourceInput>>({})
  const [newSource, setNewSource] = useState<ReadingSourceInput>(emptySource)
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void readingShelf()
      .then((value) => {
        if (!active) return
        setShelf(value)
        setDrafts(Object.fromEntries(value.sources.map((source) => [source.id, input(source)])))
      })
      .catch((error) => active && setNotice(errorMessage(error)))
    void loadReadingDependencies()
      .then(([allAssistants, allProviders, allTemplates]) => {
        if (!active) return
        setAssistants(allAssistants)
        setProviders(allProviders)
        setTemplates(allTemplates)
        const provider = allProviders.find((item) => item.enabled && item.hasApiKey)
        setProviderId(provider?.id ?? '')
        setModel(provider?.models[0] ?? '')
      })
      .catch((error) => active && setNotice(errorMessage(error)))
    return () => {
      active = false
    }
  }, [])

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === providerId),
    [providers, providerId],
  )

  async function bindAssistant(id: string) {
    if (!shelf) return
    setBusy('assistant')
    try {
      const settings = await saveReadingSettings(shelf.settings.version, id || null)
      setShelf({ ...shelf, settings })
      setNotice(id ? '翻译助手已用于后续译题。' : '已暂停新的标题翻译。')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function createTranslator() {
    const template = templates.find((item) => item.id === 'general-translation-zh-cn')
    if (!template || !providerId || !model || !shelf) return
    setBusy('assistant')
    try {
      const created = await createAssistantFromTemplate(template.id, providerId, model)
      setAssistants((items) => [...items, created])
      const settings = await saveReadingSettings(shelf.settings.version, created.id)
      setShelf({ ...shelf, settings })
      setNotice('通用翻译助手已创建并绑定。')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function saveSource(source: ReadingSource) {
    setBusy(source.id)
    try {
      const saved = await saveReadingSource(source.id, drafts[source.id])
      setShelf((value) =>
        value
          ? {
              ...value,
              sources: value.sources.map((item) => (item.id === saved.id ? saved : item)),
            }
          : value,
      )
      setDrafts((values) => ({ ...values, [saved.id]: input(saved) }))
      setNotice('来源设置已保存。')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function syncSource(source: ReadingSource) {
    setBusy(source.id)
    try {
      const synced = await syncReadingSource(source.id)
      setShelf((value) =>
        value
          ? {
              ...value,
              sources: value.sources.map((item) => (item.id === synced.id ? synced : item)),
            }
          : value,
      )
      setNotice('来源检查完成。')
    } catch (error) {
      setNotice(errorMessage(error))
      void readingShelf()
        .then(setShelf)
        .catch(() => {})
    } finally {
      setBusy('')
    }
  }

  async function removeSource(source: ReadingSource) {
    if (!window.confirm(`删除来源“${source.name}”及其已收集链接？`)) return
    setBusy(source.id)
    try {
      await deleteReadingSource(source.id)
      setShelf((value) =>
        value
          ? { ...value, sources: value.sources.filter((item) => item.id !== source.id) }
          : value,
      )
      setNotice('来源已删除。')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  async function addSource() {
    setBusy('new')
    try {
      const created = await createReadingSource(newSource)
      setShelf((value) => (value ? { ...value, sources: [...value.sources, created] } : value))
      setDrafts((values) => ({ ...values, [created.id]: input(created) }))
      setNewSource({ ...emptySource, position: newSource.position + 10 })
      setNotice('来源已添加。')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  if (!shelf)
    return (
      <main className="workspace management-page">
        <p className="management-loading">{notice || '正在加载拾阅设置…'}</p>
      </main>
    )
  return (
    <main className="workspace management-page">
      <header className="dashboard-head">
        <div>
          <p className="eyebrow">READING SHELF</p>
          <h1>拾阅管理</h1>
          <p>管理公开页的博客来源与中文译题服务。</p>
        </div>
      </header>
      <div className="management-scroll reading-management">
        <section className="dashboard-card reading-service-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">DISPLAY</p>
              <h2>展示与翻译</h2>
            </div>
            <span>最近 {shelf.settings.displayDays} 天</span>
          </div>
          <div className="reading-service-fields">
            <label>
              翻译助手
              <select
                value={shelf.settings.translationAssistantId ?? ''}
                disabled={busy === 'assistant'}
                onChange={(event) => void bindAssistant(event.target.value)}
              >
                <option value="">不翻译新标题</option>
                {assistants
                  .filter((item) => item.enabled)
                  .map((assistant) => (
                    <option value={assistant.id} key={assistant.id}>
                      {assistant.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="secondary-button" onClick={onOpenAssistants}>
              打开助手管理
            </button>
          </div>
          {!assistants.some((item) => item.name === '通用翻译助手' && item.enabled) && (
            <div className="reading-template-row">
              <select
                value={providerId}
                onChange={(event) => {
                  const id = event.target.value
                  const provider = providers.find((item) => item.id === id)
                  setProviderId(id)
                  setModel(provider?.models[0] ?? '')
                }}
              >
                <option value="">选择服务商</option>
                {providers
                  .filter((item) => item.enabled && item.hasApiKey)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
              </select>
              <select
                value={model}
                disabled={!selectedProvider}
                onChange={(event) => setModel(event.target.value)}
              >
                <option value="">选择模型</option>
                {selectedProvider?.models.map((name) => (
                  <option value={name} key={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                className="secondary-button"
                disabled={!providerId || !model || busy === 'assistant'}
                onClick={() => void createTranslator()}
              >
                创建通用翻译助手
              </button>
            </div>
          )}
        </section>

        <section className="reading-source-list" aria-label="博客来源">
          {shelf.sources.map((source) => (
            <SourceEditor
              key={source.id}
              source={source}
              value={drafts[source.id] ?? input(source)}
              busy={busy === source.id}
              onChange={(value) => setDrafts((items) => ({ ...items, [source.id]: value }))}
              onSave={() => void saveSource(source)}
              onSync={() => void syncSource(source)}
              onDelete={() => void removeSource(source)}
            />
          ))}
        </section>

        <section className="dashboard-card reading-add-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">NEW SOURCE</p>
              <h2>添加来源</h2>
            </div>
          </div>
          <SourceFields value={newSource} onChange={setNewSource} />
          <div className="reading-actions">
            <button className="primary" disabled={busy === 'new'} onClick={() => void addSource()}>
              添加来源
            </button>
          </div>
        </section>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </main>
  )
}

function SourceEditor({
  source,
  value,
  busy,
  onChange,
  onSave,
  onSync,
  onDelete,
}: {
  source: ReadingSource
  value: ReadingSourceInput
  busy: boolean
  onChange: (value: ReadingSourceInput) => void
  onSave: () => void
  onSync: () => void
  onDelete: () => void
}) {
  return (
    <article className="dashboard-card reading-source-card">
      <div className="card-head">
        <div>
          <p className="eyebrow">{source.articleCount} 篇链接</p>
          <h2>{source.name}</h2>
          <p>
            {source.lastError
              ? `最近检查失败：${source.lastError}`
              : source.lastSuccessAt
                ? `最近成功：${new Date(source.lastSuccessAt).toLocaleString('zh-CN')}`
                : '尚未完成首次检查'}
          </p>
        </div>
        <label className="reading-switch">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          />
          启用
        </label>
      </div>
      <SourceFields value={value} onChange={onChange} />
      <div className="reading-actions">
        <button className="secondary-button" disabled={busy} onClick={onSync}>
          立即检查
        </button>
        <button className="primary" disabled={busy} onClick={onSave}>
          保存
        </button>
        <button className="danger-button" disabled={busy} onClick={onDelete}>
          删除
        </button>
      </div>
    </article>
  )
}

function SourceFields({
  value,
  onChange,
}: {
  value: ReadingSourceInput
  onChange: (value: ReadingSourceInput) => void
}) {
  return (
    <div className="reading-source-fields">
      <label>
        名称
        <input
          value={value.name}
          maxLength={120}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        说明
        <input
          value={value.description}
          maxLength={240}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>
      <label>
        站点地址
        <input
          type="url"
          value={value.siteUrl}
          onChange={(event) => onChange({ ...value, siteUrl: event.target.value })}
        />
      </label>
      <label>
        列表地址
        <input
          type="url"
          value={value.listingUrl}
          onChange={(event) => onChange({ ...value, listingUrl: event.target.value })}
        />
      </label>
      <label>
        来源类型
        <select
          value={value.adapter}
          onChange={(event) => {
            const adapter = event.target.value as ReadingSourceInput['adapter']
            const url =
              adapter === 'OPENAI_DEVELOPERS'
                ? 'https://developers.openai.com/blog'
                : 'https://www.anthropic.com/engineering'
            onChange({ ...value, adapter, siteUrl: url, listingUrl: url })
          }}
        >
          <option value="OPENAI_DEVELOPERS">OpenAI Developers</option>
          <option value="ANTHROPIC_ENGINEERING">Anthropic Engineering</option>
        </select>
      </label>
      <label>
        显示顺序
        <input
          type="number"
          min={0}
          max={10000}
          value={value.position}
          onChange={(event) => onChange({ ...value, position: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}

function input(source: ReadingSource): ReadingSourceInput {
  return {
    name: source.name,
    description: source.description,
    siteUrl: source.siteUrl,
    listingUrl: source.listingUrl,
    adapter: source.adapter,
    enabled: source.enabled,
    position: source.position,
  }
}
