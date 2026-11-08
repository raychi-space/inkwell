import type { AnalyticsOverview } from './api'

const number = new Intl.NumberFormat('zh-CN')
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })

export function AnalyticsSources({
  report,
  source,
  loading,
  onSourceChange,
}: {
  report: AnalyticsOverview
  source: string
  loading: boolean
  onSourceChange: (source: string) => void
}) {
  const total = report.trend.reduce((sum, row) => sum + row.pageViews, 0)
  return (
    <section className="dashboard-card analytics-sources" aria-labelledby="analytics-sources-title">
      <div className="analytics-section-head">
        <h2 id="analytics-sources-title">访问来源</h2>
        {source && (
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => onSourceChange('')}
          >
            清除来源筛选
          </button>
        )}
      </div>
      <div className="analytics-source-scroll">
        <table>
          <thead>
            <tr>
              <th>来源域名</th>
              <th>浏览量 PV</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            {report.sources.map((row) => (
              <tr key={row.name}>
                <td>
                  <button
                    type="button"
                    className="analytics-source-button"
                    aria-pressed={source === row.name}
                    disabled={loading}
                    onClick={() => onSourceChange(source === row.name ? '' : row.name)}
                  >
                    {row.name === 'direct_or_unknown' ? '直接访问或未知' : row.name}
                  </button>
                </td>
                <td>{number.format(row.pageViews)}</td>
                <td>{percent.format(total ? row.pageViews / total : 0)}</td>
              </tr>
            ))}
            {!report.sources.length && (
              <tr>
                <td colSpan={3}>这个区间还没有来源数据。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
