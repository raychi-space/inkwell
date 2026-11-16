import { Button } from '../shared/ui/Button'
import { useEffect, useState } from 'react'
import { AgentSettings } from '../features/ai/AgentSettings'
import { ReadingModels } from '../features/reading/ReadingModels'
import { readingIntegration } from '../features/reading/api'
import { PageHeader } from '../shared/ui/PageHeader'
import { errorMessage } from '../shared/lib/errors'

type Props = {
  initialTab: 'writing' | 'reading'
  dirty: boolean
  pending: boolean
  onDirtyChange: (value: boolean) => void
  onBusyChange: (value: boolean) => void
}
export function AssistantManagement(p: Props) {
  const [tab, setTab] = useState(p.initialTab)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void readingIntegration()
      .then((v) => {
        if (active) {
          setConfigured(v.mode === 'aihot' && !!v.managementConfigured)
          setNotice('')
        }
      })
      .catch((e) => {
        if (active) {
          setConfigured(false)
          setNotice(errorMessage(e))
        }
      })
    return () => {
      active = false
    }
  }, [revision])
  const navigation = (
    <nav className="reading-tabs management-tabs" aria-label="助手管理页签">
      {(
        [
          ['writing', '写作助手'],
          ['reading', '拾阅模型'],
        ] as const
      ).map(([key, label]) => (
        <Button
          variant="unstyled"
          key={key}
          disabled={p.pending}
          className={tab === key ? 'active' : ''}
          aria-current={tab === key ? 'page' : undefined}
          onClick={() => {
            if (key !== tab && (!p.dirty || window.confirm('当前配置尚未保存，确定放弃吗？')))
              setTab(key)
          }}
        >
          {label}
        </Button>
      ))}
    </nav>
  )
  return tab === 'writing' ? (
    <AgentSettings
      navigation={navigation}
      onDirtyChange={p.onDirtyChange}
      onBusyChange={p.onBusyChange}
    />
  ) : (
    <main className="workspace studio-page management-page">
      <PageHeader
        kicker="AI STUDIO"
        title="助手管理"
        actions={
          <Button
            variant="secondary"
            disabled={p.pending}
            onClick={() => {
              if (!p.dirty || window.confirm('当前配置尚未保存，确定放弃并刷新吗？'))
                setRevision((v) => v + 1)
            }}
          >
            手动刷新
          </Button>
        }
      />
      {navigation}
      <div className="management-scroll reading-management">
        {configured === null ? (
          <p>正在加载拾阅配置…</p>
        ) : configured ? (
          <ReadingModels refresh={revision} onDirty={p.onDirtyChange} onBusy={p.onBusyChange} />
        ) : (
          <p role="status">{notice || '拾阅模型管理尚未配置。'}</p>
        )}
      </div>
    </main>
  )
}
