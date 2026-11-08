import { useId, useState, type PointerEvent } from 'react'
import type { AnalyticsOverview } from './api'
const number = new Intl.NumberFormat('zh-CN')
export function AnalyticsCharts({ report }: { report: AnalyticsOverview }) {
  const [dimension, setDimension] = useState<'countries' | 'provinces' | 'cities'>('countries')
  const [point, setPoint] = useState<number | null>(null)
  const tooltipId = useId()
  const keyboardHelpId = useId()
  const maximum = Math.max(1, ...report.trend.map((row) => row.pageViews))
  const points = report.trend.map((row, i) => ({
    ...row,
    x: 12 + (i / Math.max(1, report.trend.length - 1)) * 676,
    y: 180 - (row.pageViews / maximum) * 152,
  }))
  const rows = report[dimension].slice(0, 8)
  const maxRegion = Math.max(1, ...rows.map((row) => row.pageViews))
  const selected = point === null ? null : points[Math.min(point, points.length - 1)]
  function pointAt(event: PointerEvent<SVGSVGElement>) {
    if (!points.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = ((event.clientX - bounds.left) / bounds.width) * 700
    setPoint(
      Math.max(
        0,
        Math.min(points.length - 1, Math.round(((position - 12) / 676) * (points.length - 1))),
      ),
    )
  }
  const ticks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].filter(
    (i) => i >= 0 && i < points.length,
  )
  return (
    <div className="analytics-charts">
      <section className="dashboard-card analytics-line-card">
        <div className="analytics-section-head">
          <h2>每日访问量</h2>
          <span>浏览量 PV</span>
        </div>
        <div className="analytics-line-layout">
          <div className="analytics-y-labels">
            <span>{number.format(maximum)}</span>
            <span>{number.format(maximum / 2)}</span>
            <span>0</span>
          </div>
          <div className="analytics-line-area">
            <div className="analytics-line-plot">
              <svg
                className="analytics-line"
                preserveAspectRatio="none"
                viewBox="0 0 700 200"
                role="img"
                aria-label={`每日访问量，${report.from} 起共 ${points.length} 天`}
                tabIndex={points.length ? 0 : undefined}
                aria-describedby={`${keyboardHelpId}${selected ? ` ${tooltipId}` : ''}`}
                onPointerMove={(event) => {
                  if (event.pointerType !== 'touch') pointAt(event)
                }}
                onPointerDown={pointAt}
                onPointerLeave={(event) => {
                  if (
                    event.pointerType !== 'touch' &&
                    event.currentTarget !== event.currentTarget.ownerDocument.activeElement
                  )
                    setPoint(null)
                }}
                onFocus={() => setPoint((previous) => previous ?? 0)}
                onBlur={() => setPoint(null)}
                onKeyDown={(event) => {
                  if (!points.length) return
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setPoint(null)
                    return
                  }
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  setPoint((previous) =>
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? points.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              points.length - 1,
                              (previous ?? 0) + (event.key === 'ArrowRight' ? 1 : -1),
                            ),
                          ),
                  )
                }}
              >
                {[28, 104, 180].map((y) => (
                  <line className="analytics-grid-line" key={y} x1="12" y1={y} x2="688" y2={y} />
                ))}
                {points.length > 1 && (
                  <path
                    className="analytics-line-fill"
                    d={`M${points[0].x},180 ${points.map((row) => `L${row.x},${row.y}`).join(' ')} L${points.at(-1)!.x},180 Z`}
                  />
                )}
                <polyline
                  className="analytics-line-stroke"
                  points={points.map((row) => `${row.x},${row.y}`).join(' ')}
                />
                {points.map((row, i) => (
                  <circle
                    key={row.day}
                    className="analytics-line-point"
                    cx={row.x}
                    cy={row.y}
                    r={point === i ? 5 : 3}
                    onPointerEnter={() => setPoint(i)}
                  />
                ))}
              </svg>
              {selected && (
                <div
                  id={tooltipId}
                  role="tooltip"
                  className="analytics-chart-tooltip"
                  style={{
                    left: `clamp(0px, calc(${(selected.x / 700) * 100}% - 72px), max(0px, calc(100% - 144px)))`,
                    top: `${selected.y / 2}%`,
                    transform:
                      selected.y < 70 ? 'translateY(10px)' : 'translateY(calc(-100% - 10px))',
                  }}
                >
                  <span>{selected.day}</span>
                  <strong>{number.format(selected.pageViews)} PV</strong>
                </div>
              )}
            </div>
            <span id={keyboardHelpId} className="sr-only">
              使用左右方向键查看每日数值，Home 和 End 跳至首尾，Escape 关闭提示。
            </span>
            <div className="analytics-x-labels">
              {ticks.map((i) => (
                <span key={i}>{points[i].day.slice(5)}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="dashboard-card analytics-region-card">
        <div className="analytics-section-head">
          <h2>访问来自哪里</h2>
          <label>
            <span className="sr-only">地区维度</span>
            <select
              aria-label="地区维度"
              value={dimension}
              onChange={(event) => setDimension(event.target.value as typeof dimension)}
            >
              <option value="countries">国家</option>
              <option value="provinces">省份</option>
              <option value="cities">城市</option>
            </select>
          </label>
        </div>
        <div className="analytics-region-chart" role="list" aria-label="地区访问量排名">
          {rows.map((row) => (
            <div className="analytics-region-row" role="listitem" key={row.name}>
              <div>
                <span>{row.name === 'unknown' ? '未知' : row.name}</span>
                <span>{number.format(row.pageViews)} PV</span>
              </div>
              <div className="analytics-region-track">
                <span style={{ width: `${(row.pageViews / maxRegion) * 100}%` }} />
              </div>
            </div>
          ))}
          {!rows.length && <p>这个区间还没有数据。</p>}
        </div>
      </section>
    </div>
  )
}
