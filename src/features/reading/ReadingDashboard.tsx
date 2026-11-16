import { Card } from '../../shared/ui/Card'
import { Select } from '../../shared/ui/Select'
import { useSessionState } from '../../shared/lib/useSessionState'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../shared/lib/errors'
import { readingDashboard, type ReadingDashboard as Report } from './management-api'
import {
  ReadingPager,
  ReadingTrend,
  readingNumber,
  readingTime,
  taskStatus,
} from './ManagementParts'

export function ReadingDashboard({ refresh }: { refresh: number }) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [status, setStatus] = useSessionState('reading.status', 'failed'),
    [kind, setKind] = useSessionState('reading.kind', 'all'),
    [page, setPage] = useSessionState('reading.tasks.page', 1)
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    setBusy(true)
    setError('')
    void readingDashboard({ status, kind, page })
      .then((value) => {
        if (generation.current === current) {
          setReport(value)
          if (value.tasks.page !== page) setPage(value.tasks.page)
        }
      })
      .catch((e) => {
        if (generation.current === current) setError(errorMessage(e))
      })
      .finally(() => {
        if (generation.current === current) setBusy(false)
      })
    return () => {
      generation.current++
    }
  }, [refresh, status, kind, page])
  return (
    <div className="reading-panel">
      {error && <p role="alert">{error}</p>}
      {busy && (
        <p className="reading-loading" role="status">
          正在查询运行状态…
        </p>
      )}
      {report && (
        <>
          <div className="reading-processes">
            {(['api', 'worker'] as const).map((role) => (
              <span key={role} title={readingTime(report.processes[role].lastSeenAt)}>
                {role === 'api' ? 'API' : 'Worker'}：
                {(
                  { healthy: '正常', stale: '心跳超时', unknown: '尚无心跳' } as Record<
                    string,
                    string
                  >
                )[report.processes[role].status] ?? '未知'}
              </span>
            ))}
            <span>检查于 {readingTime(report.checkedAt)}</span>
          </div>
          <div className="reading-metrics">
            {[
              [
                '健康来源',
                `${readingNumber(report.sources.healthy)} / ${readingNumber(report.sources.enabled)}`,
              ],
              ['今日采集', readingNumber(report.counts.collectedToday)],
              ['待处理', readingNumber(report.counts.pending)],
              ['已发布', readingNumber(report.counts.published)],
            ].map(([label, value]) => (
              <Card key={label}>
                <h2>{label}</h2>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>
          <ReadingTrend rows={report.trend} />
          <Card>
            <div className="reading-card-heading">
              <h2>模型用量与限额</h2>
              <span>
                近7天请求 {readingNumber(report.modelSummary.calls)} · 成功{' '}
                {readingNumber(report.modelSummary.ok)} · 失败{' '}
                {readingNumber(report.modelSummary.failed)} · 未知{' '}
                {readingNumber(report.modelSummary.unknown)}
              </span>
            </div>
            <p>
              Token 输入 {readingNumber(report.modelSummary.tokensIn)} · 输出{' '}
              {readingNumber(report.modelSummary.tokensOut)}
            </p>
            <div className="reading-table-wrap">
              <table className="reading-table">
                <thead>
                  <tr>
                    <th>服务</th>
                    <th>每分钟</th>
                    <th>每小时</th>
                    <th>滚动24小时</th>
                  </tr>
                </thead>
                <tbody>
                  {report.budgets.map((b) => (
                    <tr key={b.service}>
                      <td>{b.service}</td>
                      <td>
                        {b.usedMinute} / {b.perMinute}
                      </td>
                      <td>
                        {b.usedHour} / {b.perHour}
                      </td>
                      <td>
                        {b.usedDay} / {b.perDay}
                      </td>
                    </tr>
                  ))}
                  {!report.budgets.length && (
                    <tr>
                      <td colSpan={4}>暂无已配置模型的用量。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <div className="reading-card-heading">
              <h2>最近任务</h2>
              <div className="reading-filters">
                <label>
                  状态
                  <Select
                    hideLabel
                    floating
                    label="状态"
                    value={status}
                    onChange={(selection) => {
                      setStatus(selection)
                      setPage(1)
                    }}
                    options={[
                      { value: 'failed', label: '异常' },
                      { value: 'all', label: '全部' },
                      { value: 'running', label: '进行中' },
                      { value: 'ok', label: '成功' },
                      { value: 'skipped', label: '跳过' },
                    ]}
                  />
                </label>
                <label>
                  类型
                  <Select
                    hideLabel
                    floating
                    label="类型"
                    value={kind}
                    onChange={(selection) => {
                      setKind(selection)
                      setPage(1)
                    }}
                    options={[
                      { value: 'all', label: '全部' },
                      { value: 'schedule', label: '调度' },
                      { value: 'collection', label: '来源采集' },
                      { value: 'model', label: '模型调用' },
                    ]}
                  />
                </label>
              </div>
            </div>
            <div className="reading-table-wrap">
              <table className="reading-table">
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>状态</th>
                    <th>开始时间</th>
                    <th>结束时间</th>
                    <th>异常</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tasks.items.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{taskStatus[t.status] ?? t.status}</td>
                      <td>{readingTime(t.startedAt)}</td>
                      <td>{readingTime(t.finishedAt)}</td>
                      <td>{t.error ?? '—'}</td>
                    </tr>
                  ))}
                  {!report.tasks.items.length && (
                    <tr>
                      <td colSpan={5}>当前筛选下没有任务记录。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ReadingPager {...report.tasks} busy={busy} onPage={setPage} label="任务分页" />
          </Card>
        </>
      )}
    </div>
  )
}
