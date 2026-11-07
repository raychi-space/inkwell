import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyticsOverview,
  analyticsEvents,
  type AnalyticsFilters,
  type AnalyticsOverview,
  type AnalyticsEvents,
} from './api'
import { AnalyticsCollection } from './AnalyticsCollection'
import { AnalyticsCharts } from './AnalyticsCharts'
import { errorMessage } from '../../shared/lib/errors'
import { PageHeader } from '../../shared/ui/PageHeader'

const number = new Intl.NumberFormat('zh-CN')
const time = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'short',
  timeStyle: 'medium',
})
function day(offset: number) {
  return new Date(Date.now() + (offset * 24 + 8) * 3600000).toISOString().slice(0, 10)
}
function initialFilters(): AnalyticsFilters {
  return {
    from: day(-6),
    until: day(0),
    path: '',
    source: '',
    ip: '',
    country: '',
    province: '',
    city: '',
  }
}
const region = (parts: string[]) =>
  parts.filter((value) => value && value !== 'unknown').join(' / ') || '未知'

export function AnalyticsDashboard() {
  const [filters, setFilters] = useState(initialFilters)
  const [applied, setApplied] = useState(initialFilters)
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [events, setEvents] = useState<AnalyticsEvents | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (query: AnalyticsFilters, page = 1) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const [report, details] = await Promise.all([
        analyticsOverview(query, controller.signal),
        analyticsEvents(query, page, controller.signal),
      ])
      if (controller.signal.aborted) return
      setOverview(report)
      setEvents(details)
      setApplied(query)
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load(initialFilters())
    return () => request.current?.abort()
  }, [load])
  const field = (key: keyof AnalyticsFilters, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }))
  const pages = events ? Math.max(1, Math.ceil(events.total / events.pageSize)) : 1
  return (
    <main className="workspace studio-page analytics-page">
      <PageHeader
        kicker="ANALYTICS"
        title="访问统计"
        subtitle="公开站的访问与来源 · 北京时间"
        actions={<AnalyticsCollection />}
        actionsLabel="统计功能"
      />
      <div className="analytics-metrics" aria-busy={loading}>
        {(
          [
            ['总浏览量', overview?.summary.pageViews],
            ['总访客数', overview?.summary.visitors],
            ['今日浏览量', overview?.summary.todayPageViews],
            ['今日访客数', overview?.summary.todayVisitors],
          ] as const
        ).map(([label, value]) => (
          <section className="dashboard-card" key={label}>
            <h2>{label}</h2>
            <strong>{value === undefined ? '—' : number.format(value)}</strong>
          </section>
        ))}
      </div>
      <form
        className="dashboard-card analytics-filter"
        onSubmit={(event) => {
          event.preventDefault()
          void load(filters)
        }}
      >
        <label>
          开始日期
          <input
            type="date"
            required
            value={filters.from}
            onChange={(event) => field('from', event.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            required
            value={filters.until}
            onChange={(event) => field('until', event.target.value)}
          />
        </label>
        {(
          [
            ['ip', 'IP 地址'],
            ['country', '国家'],
            ['province', '省份'],
            ['city', '城市'],
            ['path', '页面路径'],
            ['source', '来源域名'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              value={filters[key]}
              onChange={(event) => field(key, event.target.value)}
              placeholder={key === 'path' ? '/reading' : '全部'}
              maxLength={512}
            />
          </label>
        ))}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? '正在查询…' : '查询'}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => {
            const value = initialFilters()
            setFilters(value)
            void load(value)
          }}
        >
          重置
        </button>
      </form>
      {loading && <p role="status">正在读取统计…</p>}
      {error && (
        <div className="dashboard-card analytics-error">
          <p role="alert">{error}</p>
          <button type="button" className="secondary-button" onClick={() => void load(filters)}>
            重试
          </button>
        </div>
      )}
      {overview && (
        <>
          <AnalyticsCharts report={overview} />
          <section
            className="dashboard-card analytics-details"
            aria-labelledby="analytics-details-title"
          >
            <div className="analytics-section-head">
              <h2 id="analytics-details-title">访问明细</h2>
              <span>
                {applied.from} 至 {applied.until} · {number.format(events?.total ?? 0)} 条
              </span>
            </div>
            <div className="analytics-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>访问时间</th>
                    <th>原始 IP</th>
                    <th>归属地</th>
                    <th>访问页面</th>
                    <th>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {events?.items.map((item) => (
                    <tr key={item.id}>
                      <td>{time.format(new Date(item.occurredAt))}</td>
                      <td>{item.ip ?? '未记录'}</td>
                      <td>{region([item.country, item.province, item.city])}</td>
                      <td>{item.path}</td>
                      <td>
                        {item.source === 'direct_or_unknown' ? '直接访问或未知' : item.source}
                      </td>
                    </tr>
                  ))}
                  {!events?.items.length && (
                    <tr>
                      <td colSpan={5}>这个条件下还没有访问记录。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="analytics-pagination">
              <span>
                第 {events?.page ?? 1} / {pages} 页
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={loading || !events || events.page <= 1}
                onClick={() => void load(applied, (events?.page ?? 1) - 1)}
              >
                上一页
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={loading || !events || events.page >= pages}
                onClick={() => void load(applied, (events?.page ?? 1) + 1)}
              >
                下一页
              </button>
            </div>
          </section>
          <p className="analytics-note">
            明细与原始 IP 保留 {overview.retention.rawDays} 天；趋势保留{' '}
            {overview.retention.aggregateDays}{' '}
            天。总量卡片为全站累计及今日数据，筛选作用于图表和明细。访客按匿名浏览器标识估算，自{' '}
            {time.format(new Date(overview.retention.visitorTrackingSince))}{' '}
            开始去重；更换设备或清除存储可能重复计数。
          </p>
          {!overview.retention.geoConfigured && (
            <p className="analytics-note">归属地数据库尚未准备好，地区暂显示为未知。</p>
          )}
        </>
      )}
    </main>
  )
}
