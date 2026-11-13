import { useEffect, useState } from 'react'
import { listArticles } from '../features/articles/api'
import type { Article } from '../features/articles/types'
import {
  analyticsOverview,
  analyticsSettings,
  type AnalyticsOverview,
  type AnalyticsSettings,
} from '../features/analytics/api'
import { AnalyticsCharts } from '../features/analytics/AnalyticsCharts'
import { readingIntegration } from '../features/reading/api'
import { readingDashboard, type ReadingDashboard } from '../features/reading/management-api'
import { ApiError } from '../shared/api/client'
import { PageHeader } from '../shared/ui/PageHeader'

const number = new Intl.NumberFormat('zh-CN')
const date = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'short',
  timeStyle: 'short',
})
const day = (offset: number) =>
  new Date(Date.now() + (offset * 24 + 8) * 3600000).toISOString().slice(0, 10)
const statusText: Record<string, string> = {
  healthy: '正常',
  stale: '心跳超时',
  unknown: '尚无心跳',
}
type Data<T> = { value?: T; error?: string }
type ContentData = { published: number; drafts: number; recent: Article[] }

export function OverviewDashboard({
  busy,
  notice,
  onCreate,
  onOpen,
  onContent,
  onAnalytics,
  onReading,
}: {
  busy: boolean
  notice: string
  onCreate: (type: Article['type']) => void
  onOpen: (id: string) => void
  onContent: () => void
  onAnalytics: () => void
  onReading: () => void
}) {
  const [revision, setRevision] = useState(0)
  const [content, setContent] = useState<Data<ContentData>>({})
  const [analytics, setAnalytics] = useState<Data<AnalyticsOverview>>({})
  const [settings, setSettings] = useState<Data<AnalyticsSettings>>({})
  const [reading, setReading] = useState<Data<ReadingDashboard>>({})

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    setContent({})
    setAnalytics({})
    setSettings({})
    setReading({})
    void Promise.all([
      listArticles(1, { status: 'PUBLISHED' }, { pageSize: 1, signal }),
      listArticles(1, { status: 'DRAFT' }, { pageSize: 1, signal }),
      listArticles(1, { sort: 'recent' }, { pageSize: 5, signal }),
    ])
      .then(([published, drafts, recent]) => {
        if (!signal.aborted)
          setContent({
            value: { published: published.total, drafts: drafts.total, recent: recent.items },
          })
      })
      .catch(() => {
        if (!signal.aborted) setContent({ error: '内容暂时无法读取' })
      })
    void analyticsOverview(
      { from: day(-6), until: day(0), source: '', ip: '', country: '', province: '', city: '' },
      signal,
    )
      .then((value) => {
        if (!signal.aborted) setAnalytics({ value })
      })
      .catch(() => {
        if (!signal.aborted) setAnalytics({ error: '访问统计暂时无法读取' })
      })
    void analyticsSettings(signal)
      .then((value) => {
        if (!signal.aborted) setSettings({ value })
      })
      .catch(() => {
        if (!signal.aborted) setSettings({ error: '采集状态暂时无法读取' })
      })
    void readingIntegration(signal)
      .then((integration) => {
        if (integration.mode !== 'aihot' || !integration.managementConfigured) {
          if (!signal.aborted) setReading({ error: '拾阅管理尚未配置' })
          return null
        }
        return readingDashboard({ status: 'failed', kind: 'all', page: 1 }, signal)
      })
      .then((value) => {
        if (!signal.aborted && value) setReading({ value })
      })
      .catch((error: unknown) => {
        if (!signal.aborted)
          setReading({
            error:
              error instanceof ApiError && error.status === 404
                ? '拾阅管理尚未配置'
                : '拾阅状态暂时无法读取',
          })
      })
    return () => controller.abort()
  }, [revision])

  const collectionStatus =
    settings.error ??
    (!settings.value
      ? '正在读取采集状态…'
      : !settings.value.configured
        ? '访问统计尚未配置'
        : !settings.value.enabled
          ? '访问统计已关闭'
          : '')
  const metrics = [
    ['今日浏览量', analytics.value?.summary.todayPageViews],
    ['今日访客', analytics.value?.summary.todayVisitors],
    ['已发布内容', content.value?.published],
    ['草稿', content.value?.drafts],
  ] as const

  return (
    <main className="workspace studio-page analytics-page overview-page">
      <PageHeader
        kicker="OVERVIEW"
        title="概览"
        actionsLabel="概览操作"
        actions={
          <>
            <button onClick={() => setRevision((value) => value + 1)}>刷新</button>
            <button disabled={busy} onClick={() => onCreate('POST')}>
              ＋ 写帖子
            </button>
            <button className="primary" disabled={busy} onClick={() => onCreate('ARTICLE')}>
              ＋ 写文章
            </button>
          </>
        }
      />
      <div className="management-scroll overview-scroll">
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <div className="analytics-metrics overview-metrics">
          {metrics.map(([label, value]) => (
            <section className="dashboard-card" key={label}>
              <h2>{label}</h2>
              <strong>{value === undefined ? '—' : number.format(value)}</strong>
            </section>
          ))}
        </div>
        <div className="overview-grid">
          <section className="overview-trend" aria-label="近 7 天访问量">
            <div className="overview-section-heading">
              <h2>近 7 天访问量</h2>
              <button onClick={onAnalytics}>访问统计 →</button>
            </div>
            {collectionStatus && <p role="status">{collectionStatus}</p>}
            {analytics.error ? (
              <p role="status">{analytics.error}</p>
            ) : analytics.value ? (
              <AnalyticsCharts report={analytics.value} lineOnly />
            ) : (
              <p role="status">正在读取访问统计…</p>
            )}
          </section>
          <section className="dashboard-card overview-reading">
            <div className="overview-section-heading">
              <h2>拾阅状态</h2>
              <button onClick={onReading}>拾阅管理 →</button>
            </div>
            {reading.error ? (
              <p role="status">{reading.error}</p>
            ) : reading.value ? (
              <>
                <dl>
                  <div>
                    <dt>API</dt>
                    <dd>{statusText[reading.value.processes.api.status] ?? '未知'}</dd>
                  </div>
                  <div>
                    <dt>Worker</dt>
                    <dd>{statusText[reading.value.processes.worker.status] ?? '未知'}</dd>
                  </div>
                  <div>
                    <dt>今日采集</dt>
                    <dd>{number.format(reading.value.counts.collectedToday)} 条</dd>
                  </div>
                  <div>
                    <dt>待处理</dt>
                    <dd>{number.format(reading.value.counts.pending)} 条</dd>
                  </div>
                  <div>
                    <dt>来源异常</dt>
                    <dd>{number.format(reading.value.sources.failing)} 个</dd>
                  </div>
                </dl>
                <p>检查于 {date.format(new Date(reading.value.checkedAt))}</p>
              </>
            ) : (
              <p role="status">正在读取拾阅状态…</p>
            )}
          </section>
        </div>
        <section className="dashboard-card overview-recent">
          <div className="overview-section-heading">
            <h2>最近内容</h2>
            <button onClick={onContent}>内容管理 →</button>
          </div>
          {content.error ? (
            <p role="status">{content.error}</p>
          ) : !content.value ? (
            <p role="status">正在读取内容…</p>
          ) : content.value.recent.length ? (
            <div className="overview-content-list">
              {content.value.recent.map((item) => (
                <button
                  className="overview-content-row"
                  key={item.id}
                  onClick={() => onOpen(item.id)}
                >
                  <span className="overview-content-title">
                    {item.title || item.bodyMarkdown.trim().slice(0, 60) || '未命名内容'}
                  </span>
                  <span>
                    {item.type === 'ARTICLE' ? '文章' : '帖子'} ·{' '}
                    {item.status === 'DRAFT'
                      ? '草稿'
                      : item.hasUnpublishedChanges
                        ? '有未发布修改'
                        : '已发布'}
                  </span>
                  <time dateTime={item.updatedAt}>{date.format(new Date(item.updatedAt))}</time>
                </button>
              ))}
            </div>
          ) : (
            <p>暂无内容。</p>
          )}
        </section>
      </div>
    </main>
  )
}
