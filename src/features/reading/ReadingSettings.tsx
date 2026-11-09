import { useEffect, useState } from 'react'
import { ApiError } from '../../shared/api/client'
import { errorMessage } from '../../shared/lib/errors'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Card, CardHead } from '../../shared/ui/Card'
import { readingIntegration, type ReadingIntegration } from './api'
import { LegacyReadingSettings } from './LegacyReadingSettings'

const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '暂无'

export function ReadingSettings({ onOpenAssistants }: { onOpenAssistants: () => void }) {
  const [state, setState] = useState<ReadingIntegration | null>(null)
  const [legacy, setLegacy] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    setBusy(true)
    setError('')
    try {
      const value = await readingIntegration()
      setState(value)
      setLegacy(value.mode === 'legacy')
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
          <button className="secondary-button" disabled={busy} onClick={() => void refresh()}>
            {busy ? '正在检查…' : '刷新状态'}
          </button>
        }
      />
      <div className="management-scroll reading-management">
        {error && <p role="alert">{error}</p>}
        {!state ? (
          <p className="management-loading">
            {error ? '暂时无法获取接入状态。' : '正在加载拾阅状态…'}
          </p>
        ) : (
          <Card>
            <CardHead
              eyebrow="AIHOT"
              title="内容服务"
              aside={<span role="status">{state.connected ? '连接正常' : '暂时无法连接'}</span>}
            />
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
    </main>
  )
}
