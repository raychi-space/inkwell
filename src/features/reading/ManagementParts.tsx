import { useState } from 'react'
import type { ReadingDashboard } from './management-api'

export const readingTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '暂无'
export const readingNumber = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
export const taskStatus: Record<string, string> = {
  running: '进行中',
  ok: '成功',
  failed: '失败',
  skipped: '跳过',
  unknown: '结果未知',
}
export const healthStatus: Record<string, string> = {
  ok: '健康',
  degraded: '不稳定',
  failing: '异常',
  paused: '暂停',
  unknown: '尚未检查',
}

export function ReadingPager({
  page,
  pageSize,
  total,
  busy,
  onPage,
  label,
}: {
  page: number
  pageSize: number
  total: number
  busy: boolean
  onPage: (page: number) => void
  label: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav className="reading-pagination" aria-label={label}>
      <span>
        共 {readingNumber(total)} 条 · {page} / {pages}
      </span>
      <button
        className="secondary-button"
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        上一页
      </button>
      <button
        className="secondary-button"
        disabled={busy || page >= pages}
        onClick={() => onPage(page + 1)}
      >
        下一页
      </button>
    </nav>
  )
}

export function ReadingTrend({ rows }: { rows: ReadingDashboard['trend'] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const max = Math.max(1, ...rows.flatMap((r) => [r.collected, r.processed]))
  const x = (i: number) => 36 + (i / Math.max(1, rows.length - 1)) * 628
  const y = (n: number) => 174 - (n / max) * 148
  const path = (field: 'collected' | 'processed') =>
    rows.map((r, i) => `${x(i)},${y(r[field])}`).join(' ')
  return (
    <section className="dashboard-card reading-trend">
      <div className="reading-card-heading">
        <h2>近 7 天采集与处理</h2>
        <span>北京时间</span>
      </div>
      <div className="reading-trend-legend">
        <span>● 采集</span>
        <span>┄ 处理</span>
      </div>
      <svg
        viewBox="0 0 700 218"
        role="group"
        aria-label="近7天每日采集与处理数量"
        className="reading-trend-svg"
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1="36" x2="664" y1={y(v * max)} y2={y(v * max)} className="reading-chart-grid" />
            <text x="30" y={y(v * max) + 4} textAnchor="end">
              {Math.round(v * max)}
            </text>
          </g>
        ))}
        <polyline points={path('collected')} className="reading-chart-collected" />
        <polyline points={path('processed')} className="reading-chart-processed" />
        {rows.map((r, i) => (
          <g key={r.date}>
            <circle cx={x(i)} cy={y(r.collected)} r="4" className="reading-chart-dot" />
            <circle cx={x(i)} cy={y(r.processed)} r="3" className="reading-chart-processed-dot" />
            <rect
              x={x(i) - 22}
              y="14"
              width="44"
              height="168"
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${r.date}，采集${r.collected}，处理${r.processed}`}
              onPointerEnter={() => setSelected(i)}
              onPointerDown={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onBlur={() => setSelected(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelected(i)
                }
                if (e.key === 'Escape') setSelected(null)
              }}
            />
            <text x={x(i)} y="201" textAnchor="middle">
              {r.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
      <p className="reading-chart-value" aria-live="polite">
        {selected === null
          ? '悬停、点按或聚焦日期查看数值'
          : `${rows[selected].date} · 采集 ${readingNumber(rows[selected].collected)} · 处理 ${readingNumber(rows[selected].processed)}`}
      </p>
    </section>
  )
}
