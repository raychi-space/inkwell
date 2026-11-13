import { useSessionState } from '../../shared/lib/useSessionState'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../shared/api/client'
import { invalidateReadCache } from '../../shared/api/sessionCache'
import { errorMessage } from '../../shared/lib/errors'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Card, CardHead } from '../../shared/ui/Card'
import { readingIntegration, type ReadingIntegration } from './api'
import { LegacyReadingSettings } from './LegacyReadingSettings'
import { ReadingDashboard } from './ReadingDashboard'
import { ReadingSources } from './ReadingSources'
import { ReadingModels } from './ReadingModels'

const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '暂无'

export function ReadingSettings({
  onOpenAssistants,
  onDirtyChange,
  onBusyChange,
}: {
  onOpenAssistants: () => void
  onDirtyChange?: (value: boolean) => void
  onBusyChange?: (value: boolean) => void
}) {
  const [state, setState] = useState<ReadingIntegration | null>(null)
  const [legacy, setLegacy] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false)
  const [tab, setTab] = useSessionState<'dashboard' | 'sources' | 'models'>(
    'reading.tab',
    'dashboard',
  )
  const [revision, setRevision] = useState(0)
  const markDirty = useCallback(
    (value: boolean) => {
      setDirty(value)
      onDirtyChange?.(value)
    },
    [onDirtyChange],
  )
  const markBusy = useCallback(
    (value: boolean) => {
      setPending(value)
      onBusyChange?.(value)
    },
    [onBusyChange],
  )
  useEffect(
    () => () => {
      onDirtyChange?.(false)
      onBusyChange?.(false)
    },
    [onDirtyChange, onBusyChange],
  )
  const canDiscard = () =>
    !pending && (!dirty || window.confirm('当前拾阅配置尚未保存，确定放弃修改吗？'))
  const tabs = [
    ['dashboard', '运行看板'],
    ['sources', '采集来源'],
    ['models', '模型与限额'],
  ] as const
  function chooseTab(value: typeof tab) {
    if (value === tab) return true
    if (!canDiscard()) return false
    setTab(value)
    return true
  }

  useEffect(() => {
    let active = true
    void readingIntegration()
      .then((value) => {
        if (!active) return
        setState(value)
        setLegacy(value.mode === 'legacy')
      })
      .catch((value) => {
        if (!active) return
        if (value instanceof ApiError && value.status === 404) setLegacy(true)
        else setError(errorMessage(value))
      })
    return () => {
      active = false
    }
  }, [])

  async function refresh() {
    if (!canDiscard()) return
    invalidateReadCache()
    setBusy(true)
    setError('')
    try {
      const value = await readingIntegration()
      setState(value)
      setLegacy(value.mode === 'legacy')
      setRevision((previous) => previous + 1)
    } catch (value) {
      setError(errorMessage(value))
    } finally {
      setBusy(false)
    }
  }

  if (legacy) return <LegacyReadingSettings onOpenAssistants={onOpenAssistants} />
  return (
    <main className="workspace studio-page management-page">
      <PageHeader
        kicker="READING"
        title="拾阅管理"
        actions={
          <button
            className="secondary-button"
            disabled={busy || pending}
            onClick={() => void refresh()}
          >
            {busy ? '正在查询…' : state?.managementConfigured ? '手动刷新' : '刷新状态'}
          </button>
        }
      />
      <div className="management-scroll reading-management">
        {error && <p role="alert">{error}</p>}
        <div className="reading-tabs" role="tablist" aria-label="拾阅管理页签">
          {tabs.map(([key, label], index) => (
            <button
              key={key}
              id={'reading-tab-' + key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              aria-controls="reading-tabpanel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => chooseTab(key)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 2
                      : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3
                if (chooseTab(tabs[next][0]))
                  document.getElementById('reading-tab-' + tabs[next][0])?.focus()
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div id="reading-tabpanel" role="tabpanel" aria-labelledby={'reading-tab-' + tab}>
          {!state ? (
            <p className="management-loading">
              {error ? '暂时无法获取接入状态。' : '正在加载拾阅状态…'}
            </p>
          ) : state.managementConfigured ? (
            tab === 'dashboard' ? (
              <ReadingDashboard refresh={revision} />
            ) : tab === 'sources' ? (
              <ReadingSources refresh={revision} onDirty={markDirty} onBusy={markBusy} />
            ) : (
              <ReadingModels refresh={revision} onDirty={markDirty} onBusy={markBusy} />
            )
          ) : (
            <Card>
              <CardHead
                eyebrow="AIHOT"
                title="内容服务"
                aside={<span role="status">{state.connected ? '连接正常' : '暂时无法连接'}</span>}
              />
              <p role="status">管理接口尚未配置。</p>
              <dl className="reading-integration-status">
                <div>
                  <dt>最近内容更新</dt>
                  <dd>{time(state.updatedAt)}</dd>
                </div>
                <div>
                  <dt>最近检查</dt>
                  <dd>{time(state.checkedAt)}</dd>
                </div>
                <div>
                  <dt>最近连接成功</dt>
                  <dd>{time(state.lastSuccessAt)}</dd>
                </div>
              </dl>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
