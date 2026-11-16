import { Select } from '../../shared/ui/Select'
import { Input } from '../../shared/ui/Input'
import { Checkbox } from '../../shared/ui/Checkbox'
import { Button } from '../../shared/ui/Button'
import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '../../shared/lib/errors'
import { PageHeader } from '../../shared/ui/PageHeader'
import { CardHead } from '../../shared/ui/Card'
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

export function LegacyReadingSettings({ onOpenAssistants }: { onOpenAssistants: () => void }) {
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
    <main className="workspace studio-page management-page">
      <PageHeader
        kicker="READING SHELF"
        title="拾阅管理"
        subtitle="管理公开页的博客来源与中文译题服务。"
      />
      <div className="management-scroll reading-management">
        <section className="dashboard-card reading-service-card">
          <CardHead
            eyebrow="DISPLAY"
            title="展示与翻译"
            aside={<span>最近 {shelf.settings.displayDays} 天</span>}
          />
          <div className="reading-service-fields">
            <label>
              翻译助手
              <Select
                hideLabel
                floating
                label="翻译助手"
                value={shelf.settings.translationAssistantId ?? ''}
                disabled={busy === 'assistant'}
                onChange={(selection) => void bindAssistant(selection)}
                options={[
                  { value: '', label: '不翻译新标题' },
                  ...assistants
                    .filter((item) => item.enabled)
                    .map((assistant) => ({ value: assistant.id, label: assistant.name })),
                ]}
              />
            </label>
            <Button variant="secondary" className="secondary-button" onClick={onOpenAssistants}>
              打开助手管理
            </Button>
          </div>
          {!assistants.some((item) => item.name === '通用翻译助手' && item.enabled) && (
            <div className="reading-template-row">
              <Select
                hideLabel
                floating
                label="服务商"
                value={providerId}
                onChange={(selection) => {
                  const id = selection
                  const provider = providers.find((item) => item.id === id)
                  setProviderId(id)
                  setModel(provider?.models[0] ?? '')
                }}
                options={[
                  { value: '', label: '选择服务商' },
                  ...providers
                    .filter((item) => item.enabled && item.hasApiKey)
                    .map((provider) => ({ value: provider.id, label: provider.name })),
                ]}
              />
              <Select
                hideLabel
                floating
                label="模型"
                value={model}
                disabled={!selectedProvider}
                onChange={(selection) => setModel(selection)}
                options={[
                  { value: '', label: '选择模型' },
                  ...(selectedProvider?.models.map((name) => ({ value: name, label: name })) ?? []),
                ]}
              />
              <Button
                variant="secondary"
                className="secondary-button"
                disabled={!providerId || !model || busy === 'assistant'}
                onClick={() => void createTranslator()}
              >
                创建通用翻译助手
              </Button>
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
          <CardHead eyebrow="NEW SOURCE" title="添加来源" />
          <SourceFields value={newSource} onChange={setNewSource} />
          <div className="reading-actions">
            <Button
              variant="primary"
              className="primary"
              disabled={busy === 'new'}
              onClick={() => void addSource()}
            >
              添加来源
            </Button>
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
      <CardHead
        eyebrow={`${source.articleCount} 篇链接`}
        title={source.name}
        subtitle={
          source.lastError
            ? `最近检查失败：${source.lastError}`
            : source.lastSuccessAt
              ? `最近成功：${new Date(source.lastSuccessAt).toLocaleString('zh-CN')}`
              : '尚未完成首次检查'
        }
        aside={
          <label className="reading-switch">
            <Checkbox
              checked={value.enabled}
              onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
            />
            启用
          </label>
        }
      />
      <SourceFields value={value} onChange={onChange} />
      <div className="reading-actions">
        <Button variant="secondary" className="secondary-button" disabled={busy} onClick={onSync}>
          立即检查
        </Button>
        <Button variant="primary" className="primary" disabled={busy} onClick={onSave}>
          保存
        </Button>
        <Button variant="danger" className="danger-button" disabled={busy} onClick={onDelete}>
          删除
        </Button>
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
        <Input
          value={value.name}
          maxLength={120}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        说明
        <Input
          value={value.description}
          maxLength={240}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>
      <label>
        站点地址
        <Input
          type="url"
          value={value.siteUrl}
          onChange={(event) => onChange({ ...value, siteUrl: event.target.value })}
        />
      </label>
      <label>
        列表地址
        <Input
          type="url"
          value={value.listingUrl}
          onChange={(event) => onChange({ ...value, listingUrl: event.target.value })}
        />
      </label>
      <label>
        来源类型
        <Select
          hideLabel
          floating
          label="来源类型"
          value={value.adapter}
          onChange={(selection) => {
            const adapter = selection as ReadingSourceInput['adapter']
            const url =
              adapter === 'OPENAI_DEVELOPERS'
                ? 'https://developers.openai.com/blog'
                : 'https://www.anthropic.com/engineering'
            onChange({ ...value, adapter, siteUrl: url, listingUrl: url })
          }}
          options={[
            { value: 'OPENAI_DEVELOPERS', label: 'OpenAI Developers' },
            { value: 'ANTHROPIC_ENGINEERING', label: 'Anthropic Engineering' },
          ]}
        />
      </label>
      <label>
        显示顺序
        <Input
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
