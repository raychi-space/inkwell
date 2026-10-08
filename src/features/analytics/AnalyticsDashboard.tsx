import { useCallback, useEffect, useRef, useState } from 'react'
import { analyticsReport, type AnalyticsReport } from './api'
import { errorMessage } from '../../shared/lib/errors'

function utcDay(offset: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
function exclusiveEnd(inclusive: string) {
  const date = new Date(`${inclusive}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
const number = new Intl.NumberFormat('zh-CN')

function Breakdown({
  title,
  rows,
}: {
  title: string
  rows: { name: string; pageViews: number }[]
}) {
  return (
    <section className="dashboard-card analytics-breakdown">
      <h2>{title}</h2>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th scope="col">{title === '热门页面' ? '页面路径' : '来源'}</th>
              <th scope="col">PV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>{row.name === 'direct_or_unknown' ? '直接访问或未知' : row.name}</td>
                <td>{number.format(row.pageViews)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>这个区间还没有数据。</p>
      )}
    </section>
  )
}

export function AnalyticsDashboard() {
  const [from, setFrom] = useState(() => utcDay(-6))
  const [until, setUntil] = useState(() => utcDay(0))
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (start: string, end: string) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setError('')
    setLoading(true)
    setReport(null)
    try {
      const to = exclusiveEnd(end)
      const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000
      if (!Number.isFinite(days) || days < 1 || days > 366)
        throw new Error('请选择 1～366 天的日期区间。')
      const result = await analyticsReport(start, to, controller.signal)
      if (!controller.signal.aborted) setReport(result)
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load(utcDay(-6), utcDay(0))
    return () => request.current?.abort()
  }, [load])
  const maximum = Math.max(1, ...(report?.trend.map((row) => row.pageViews) ?? []))
  return (
    <main className="workspace studio-page analytics-page">
      <header className="studio-head">
        <div>
          <p className="eyebrow">ANALYTICS</p>
          <h1>访问统计</h1>
          <p>公开页面的阅读情况 · UTC 日期</p>
        </div>
      </header>
      <form
        className="dashboard-card analytics-filter"
        onSubmit={(event) => {
          event.preventDefault()
          void load(from, until)
        }}
      >
        <label>
          开始日期
          <input
            type="date"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          结束日期（含当天）
          <input
            type="date"
            required
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </label>
        <button className="primary" type="submit" disabled={loading}>
          {loading ? '正在查询…' : '查询'}
        </button>
      </form>
      {loading && <p role="status">正在读取统计…</p>}
      {error && (
        <section className="dashboard-card">
          <p role="alert">{error}</p>
          <button onClick={() => void load(from, until)}>重试</button>
        </section>
      )}
      {report && (
        <>
          <p className="analytics-note">
            {report.from} 至{' '}
            {new Date(Date.parse(`${report.to}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)}
            （UTC）。统计采用尽力采集，可能遗漏被关闭、拦截或尚未送达的浏览。
          </p>
          <div className="analytics-metrics">
            {[
              ['页面浏览 PV', report.pageViews],
              ['未识别 PV', report.unidentifiedPageViews],
              ['访客日', report.visitorDays],
              ['近似访问', report.visits],
            ].map(([label, value]) => (
              <section className="dashboard-card" key={label}>
                <h2>{label}</h2>
                <strong>{number.format(value as number)}</strong>
              </section>
            ))}
          </div>
          <p className="analytics-note">
            访客日是每日识别访客数之和；近似访问按每位识别访客的 UTC 30
            分钟桶计算。没有访客标识的浏览只计 PV。
          </p>
          <section className="dashboard-card analytics-breakdown">
            <h2>每日浏览趋势</h2>
            <div className="analytics-trend-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">日期（UTC）</th>
                    <th scope="col">浏览 PV</th>
                  </tr>
                </thead>
                <tbody>
                  {report.trend.map((row) => (
                    <tr key={row.day}>
                      <th scope="row">{row.day}</th>
                      <td>
                        <span
                          className="analytics-bar"
                          aria-hidden="true"
                          style={{ width: `${(row.pageViews / maximum) * 65}%` }}
                        />
                        {number.format(row.pageViews)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="analytics-columns">
            <Breakdown title="来源主机" rows={report.sources} />
            <Breakdown title="热门页面" rows={report.popularPaths} />
          </div>
          <p className="analytics-note">
            原始事件保留 {report.retention.rawDays} 天，聚合保留 {report.retention.aggregateDays}{' '}
            天。已排除登录站长及可识别机器人；尚未配置地区数据源。
          </p>
        </>
      )}
    </main>
  )
}
