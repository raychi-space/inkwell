import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Button } from '../../shared/ui/Button'
import type { AnalyticsMapPoint, AnalyticsMapReport } from './api'
import worldLand from './world-land.svg'

const number = new Intl.NumberFormat('zh-CN')
const compactNumber = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 0,
})
const world = { scale: 1, x: 0, y: 0 }
const precision = { city: '城市', province: '省级', country: '国家或地区' }

function label(point: AnalyticsMapPoint) {
  return [point.country, point.province, point.city].filter(Boolean).join(' / ')
}

type Marker = { key: string; points: AnalyticsMapPoint[]; count: number; x: number; y: number }

function mapMarkers(points: AnalyticsMapPoint[], pixels: number) {
  const markers: Marker[] = []
  for (const point of points) {
    const x = (point.longitude + 180) / 360
    const y = (90 - point.latitude) / 180
    // Keep overlapping markers reachable at world scale. Points separate on zoom.
    const nearby = markers.find(
      (marker) => Math.hypot(marker.x - x, (marker.y - y) / 2) * pixels < 32,
    )
    if (nearby) {
      nearby.points.push(point)
      nearby.count += point.uniqueIps
    } else {
      markers.push({ key: point.id, points: [point], count: point.uniqueIps, x, y })
    }
  }
  return markers
}

function inclusiveEnd(to: string) {
  return new Date(Date.parse(to) - 86_400_000).toISOString().slice(0, 10)
}

function WorldMap({ points }: { points: AnalyticsMapPoint[] }) {
  const [view, setView] = useState(world)
  const [hover, setHover] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [width, setWidth] = useState(360)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null)
  const markers = useMemo(() => mapMarkers(points, width * view.scale), [points, width, view.scale])
  const active = markers.find((marker) => marker.key === (hover ?? selected))

  useEffect(() => {
    if (!viewport.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [])

  function move(next: typeof world) {
    const bound = (next.scale - 1) / 2
    const clamp = (offset: number) => Math.max(-bound, Math.min(bound, offset))
    setView({ scale: next.scale, x: clamp(next.x), y: clamp(next.y) })
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (
      view.scale === 1 ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest('button, .analytics-map-location')
    )
      return
    drag.current = { startX: event.clientX, startY: event.clientY, x: view.x, y: view.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const { width, height } = event.currentTarget.getBoundingClientRect()
    move({
      scale: view.scale,
      x: drag.current.x + (event.clientX - drag.current.startX) / width,
      y: drag.current.y + (event.clientY - drag.current.startY) / height,
    })
  }

  return (
    <>
      <div className="analytics-map-controls" role="group" aria-label="地图缩放">
        <Button
          variant="secondary"
          aria-label="放大地图"
          disabled={view.scale === 16}
          onClick={() => {
            const current = markers.find((marker) => marker.key === selected)
            const scale = view.scale * 2
            move({
              scale,
              x: current ? (0.5 - current.x) * scale : view.x * 2,
              y: current ? (0.5 - current.y) * scale : view.y * 2,
            })
          }}
        >
          +
        </Button>
        <Button
          variant="secondary"
          aria-label="缩小地图"
          disabled={view.scale === 1}
          onClick={() => move({ scale: view.scale / 2, x: view.x / 2, y: view.y / 2 })}
        >
          −
        </Button>
        <Button variant="secondary" disabled={view.scale === 1} onClick={() => setView(world)}>
          全图
        </Button>
      </div>
      <div
        ref={viewport}
        className="analytics-map-viewport"
        data-zoomed={view.scale > 1}
        onPointerDown={startDrag}
        onPointerMove={pan}
        onLostPointerCapture={() => {
          drag.current = null
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setHover(null)
            setSelected(null)
          }
        }}
      >
        <div
          className="analytics-map-stage"
          style={{
            transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.scale})`,
          }}
        >
          <div className="analytics-map-land" style={{ maskImage: `url(${worldLand})` }} />
          {markers.map((marker) => (
            <Button
              variant="unstyled"
              key={marker.key}
              type="button"
              className="analytics-map-marker"
              aria-label={`${marker.points.length === 1 ? label(marker.points[0]) : `${marker.points.length} 个归属地`}，${number.format(marker.count)} 个独立 IP`}
              aria-pressed={selected === marker.key}
              style={{
                left: `${marker.x * 100}%`,
                top: `${marker.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${1 / view.scale})`,
              }}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setHover(marker.key)
              }}
              onPointerLeave={() => setHover(null)}
              onFocus={(event) => {
                if (event.currentTarget.matches(':focus-visible')) setHover(marker.key)
              }}
              onBlur={() => setHover(null)}
              onClick={() => setSelected((current) => (current === marker.key ? null : marker.key))}
            >
              {compactNumber.format(marker.count)}
            </Button>
          ))}
        </div>
        {active && (
          <div
            className="analytics-map-location"
            data-pinned={selected === active.key}
            data-align-right={(active.x - 0.5) * view.scale + view.x < 0}
            data-align-bottom={(active.y - 0.5) * view.scale + view.y < 0}
            aria-live="polite"
          >
            {active.points.map((point) => (
              <div key={point.id}>
                <strong>{label(point)}</strong>
                <span>
                  {precision[point.level]} · {number.format(point.uniqueIps)} 个独立 IP ·{' '}
                  {number.format(point.pageViews)} 次浏览
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function AnalyticsVisitMap({
  report,
  unavailable,
  loading,
  onRetry,
}: {
  report: AnalyticsMapReport | null
  unavailable: boolean
  loading: boolean
  onRetry: () => void
}) {
  const coverage = report?.coverage
  return (
    <section
      className="dashboard-card analytics-map"
      aria-labelledby="analytics-map-title"
      aria-busy={loading}
    >
      <div className="analytics-section-head">
        <h2 id="analytics-map-title">访问地图</h2>
        {report && coverage && (
          <span>
            {number.format(report.uniqueIps)} 个独立 IP
            {report.unlocatedIps > 0 && ` · ${number.format(report.unlocatedIps)} 个未定位`}
          </span>
        )}
      </div>
      {unavailable ? (
        <div className="analytics-map-message">
          <p role="alert">访问地图暂时无法读取。</p>
          <Button variant="secondary" disabled={loading} onClick={onRetry}>
            重试地图
          </Button>
        </div>
      ) : (
        report && (
          <>
            <WorldMap points={report.points} />
            {!coverage ? (
              <p className="analytics-note">所选日期没有可用的 IP 历史。</p>
            ) : (
              <>
                <p className="analytics-note">
                  地图覆盖 {coverage.from} 至 {inclusiveEnd(coverage.to)} · IP 归属地为近似位置
                  {report.detailLevel !== 'city' && ` · 按${precision[report.detailLevel]}汇总`}
                </p>
                {!report.points.length && (
                  <p className="analytics-note">
                    {report.uniqueIps ? '这些 IP 暂无可用归属地。' : '当前筛选范围内没有 IP 记录。'}
                  </p>
                )}
              </>
            )}
          </>
        )
      )}
    </section>
  )
}
