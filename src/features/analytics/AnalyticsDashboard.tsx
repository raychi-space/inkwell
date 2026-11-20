import { Card } from '../../shared/ui/Card'
import { Input } from '../../shared/ui/Input'
import { Button } from '../../shared/ui/Button'
import { useSessionState } from '../../shared/lib/useSessionState'
import { invalidateReadCache } from '../../shared/api/sessionCache'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyticsOverview,
  analyticsMap,
  type AnalyticsFilters,
  type AnalyticsOverview,
  type AnalyticsMapReport,
} from './api'
import { AnalyticsCollection } from './AnalyticsCollection'
import { AnalyticsCharts } from './AnalyticsCharts'
import { AnalyticsSources } from './AnalyticsSources'
import { AnalyticsVisitMap } from './AnalyticsVisitMap'
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
    source: '',
    ip: '',
    country: '',
    province: '',
    city: '',
  }
}
export function AnalyticsDashboard() {
  const [filters, setFilters] = useSessionState('analytics.filters', initialFilters)
  const [applied, setApplied] = useSessionState('analytics.applied', initialFilters)
  const initialQuery = useRef(applied)
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [map, setMap] = useState<AnalyticsMapReport | null>(null)
  const [mapError, setMapError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (query: AnalyticsFilters) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const [report, locations] = await Promise.all([
        analyticsOverview(query, controller.signal),
        analyticsMap(query, controller.signal).catch(() => null),
      ])
      if (controller.signal.aborted) return
      setOverview(report)
      setMap(locations)
      setMapError(locations === null)
      setApplied(query)
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load(initialQuery.current)
    return () => request.current?.abort()
  }, [load])
  const field = (key: keyof AnalyticsFilters, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }))
  return (
    <main className="workspace studio-page analytics-page">
      <PageHeader
        kicker="ANALYTICS"
        title="访问统计"
        subtitle="公开站的访问与来源 · 北京时间"
        actions={
          <>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => {
                invalidateReadCache()
                setRefresh((value) => value + 1)
                void load(applied)
              }}
            >
              刷新
            </Button>
            <AnalyticsCollection refresh={refresh} />
          </>
        }
        actionsLabel="统计功能"
      />
      <div className="management-scroll analytics-scroll">
        <div className="analytics-metrics" aria-busy={loading}>
          {(
            [
              ['总浏览量', overview?.summary.pageViews],
              ['总访客数', overview?.summary.visitors],
              ['今日浏览量', overview?.summary.todayPageViews],
              ['今日访客数', overview?.summary.todayVisitors],
            ] as const
          ).map(([label, value]) => (
            <Card key={label}>
              <h2>{label}</h2>
              <strong>{value === undefined ? '—' : number.format(value)}</strong>
            </Card>
          ))}
        </div>
        {loading && <p role="status">正在读取统计…</p>}
        {error && (
          <div className="dashboard-card analytics-error">
            <p role="alert">{error}</p>
            <Button
              variant="secondary"
              type="button"
              className="secondary-button"
              onClick={() => {
                invalidateReadCache()
                void load(filters)
              }}
            >
              重试
            </Button>
          </div>
        )}
        {overview && <AnalyticsCharts report={overview} />}
        {overview && (
          <AnalyticsSources
            report={overview}
            source={applied.source}
            loading={loading}
            onSourceChange={(source) => {
              const next = { ...applied, source }
              setFilters(next)
              void load(next)
            }}
          />
        )}
        <form
          className="dashboard-card analytics-filter"
          onSubmit={(event) => {
            event.preventDefault()
            invalidateReadCache()
            void load(filters)
          }}
        >
          <label>
            开始日期
            <Input
              type="date"
              required
              value={filters.from}
              onChange={(event) => field('from', event.target.value)}
            />
          </label>
          <label>
            结束日期
            <Input
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
              ['source', '来源域名'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <Input
                value={filters[key]}
                onChange={(event) => field(key, event.target.value)}
                placeholder="全部"
                maxLength={512}
              />
            </label>
          ))}
          <Button variant="primary" className="primary" type="submit" disabled={loading}>
            {loading ? '正在查询…' : '查询'}
          </Button>
          <Button
            variant="secondary"
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => {
              const value = initialFilters()
              invalidateReadCache()
              setFilters(value)
              void load(value)
            }}
          >
            重置
          </Button>
        </form>
        {overview && (
          <>
            <AnalyticsVisitMap
              key={JSON.stringify(applied)}
              report={map}
              unavailable={mapError}
              loading={loading}
              onRetry={() => {
                invalidateReadCache()
                void load(applied)
              }}
            />
            <p className="analytics-note">
              原始 IP 保留 {overview.retention.rawDays} 天；趋势保留{' '}
              {overview.retention.aggregateDays}{' '}
              天。总量卡片为全站累计及今日数据，筛选作用于图表和地图。访客按匿名浏览器标识估算，自{' '}
              {time.format(new Date(overview.retention.visitorTrackingSince))}{' '}
              开始去重；更换设备或清除存储可能重复计数。
            </p>
            {!overview.retention.geoConfigured && (
              <p className="analytics-note">归属地数据库尚未准备好，地区暂显示为未知。</p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
