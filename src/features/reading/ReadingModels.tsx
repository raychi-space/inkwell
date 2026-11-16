import { Card } from '../../shared/ui/Card'
import { Select } from '../../shared/ui/Select'
import { Input } from '../../shared/ui/Input'
import { Button } from '../../shared/ui/Button'
import { useSessionState } from '../../shared/lib/useSessionState'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../shared/lib/errors'
import {
  readingModels,
  switchReadingModel,
  updateReadingBudget,
  type ReadingModels as Report,
} from './management-api'
import { ReadingPager, readingNumber, readingTime } from './ManagementParts'
type BudgetDraft = { perMinute: number; perHour: number; perDay: number }
export function ReadingModels({
  refresh,
  onDirty,
  onBusy,
}: {
  refresh: number
  onDirty: (v: boolean) => void
  onBusy: (v: boolean) => void
}) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({}),
    [budgetDrafts, setBudgetDrafts] = useState<Record<string, BudgetDraft>>({})
  const [filter, setFilter] = useSessionState('reading.models.filter', ''),
    [page, setPage] = useSessionState('reading.models.page', 1)
  const generation = useRef(0),
    alive = useRef(true)
  const dirty = Object.keys(modelDrafts).length > 0 || Object.keys(budgetDrafts).length > 0
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  useEffect(() => {
    const current = ++generation.current
    setBusy(true)
    setError('')
    setModelDrafts({})
    setBudgetDrafts({})
    void readingModels()
      .then((value) => {
        if (generation.current === current) {
          setReport(value)
          setModelDrafts({})
          setBudgetDrafts({})
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
  }, [refresh])
  async function save(fn: () => Promise<Report>, done: () => void) {
    setBusy(true)
    setError('')
    setNotice('')
    onBusy(true)
    try {
      const value = await fn()
      if (alive.current) {
        setReport(value)
        done()
        setNotice('已保存，对后续任务生效。')
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e))
    } finally {
      if (alive.current) setBusy(false)
      onBusy(false)
    }
  }
  const rows = report?.capabilities.filter((c) => !filter || c.key === filter) ?? []
  return (
    <div className="reading-panel">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">正在查询或保存模型配置…</p>}
      {report && (
        <>
          {!report.metadataAvailable && (
            <p role="status">Worker模型配置尚未同步，暂时不能切换模型。</p>
          )}
          <Card>
            <div className="reading-card-heading">
              <h2>各环节模型</h2>
              <span>配置检查于 {readingTime(report.metadataAt)}</span>
            </div>
            <div className="reading-table-wrap">
              <table className="reading-table">
                <thead>
                  <tr>
                    <th>处理环节</th>
                    <th>当前模型</th>
                    <th>切换模型</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {report.capabilities.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>
                        {c.currentLabel}
                        {!c.configured && ' · 配置未确认'}
                      </td>
                      <td>
                        <Select
                          hideLabel
                          floating
                          label={`${c.label}模型`}
                          disabled={busy || !report.metadataAvailable}
                          value={modelDrafts[c.key] ?? c.currentKey}
                          onChange={(selection) =>
                            setModelDrafts((prev) => {
                              const next = { ...prev }
                              if (selection === c.currentKey) delete next[c.key]
                              else next[c.key] = selection
                              return next
                            })
                          }
                          options={[
                            ...(c.currentKey && !report.choices.some((m) => m.key === c.currentKey)
                              ? [
                                  {
                                    value: c.currentKey,
                                    label: `${c.currentLabel}（未配置）`,
                                    disabled: true,
                                  },
                                ]
                              : []),
                            ...report.choices.map((m) => ({ value: m.key, label: m.label })),
                            { value: '', label: '恢复环境默认' },
                          ]}
                        />
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          className="secondary-button"
                          disabled={
                            busy || !report.metadataAvailable || modelDrafts[c.key] === undefined
                          }
                          onClick={() =>
                            void save(
                              () => switchReadingModel(c.key, modelDrafts[c.key] || null),
                              () =>
                                setModelDrafts((prev) => {
                                  const next = { ...prev }
                                  delete next[c.key]
                                  return next
                                }),
                            )
                          }
                        >
                          保存模型
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <div className="reading-card-heading">
              <h2>调用限额</h2>
              <span>任一限额为0时暂停该服务的模型请求</span>
            </div>
            <div className="reading-budget-list">
              {report.budgets.map((b) => {
                const value = budgetDrafts[b.service] ?? {
                  perMinute: b.perMinute,
                  perHour: b.perHour,
                  perDay: b.perDay,
                }
                return (
                  <form
                    className="reading-budget-form"
                    key={b.service}
                    onSubmit={(e) => {
                      e.preventDefault()
                      void save(
                        () => updateReadingBudget(b.service, value),
                        () =>
                          setBudgetDrafts((prev) => {
                            const next = { ...prev }
                            delete next[b.service]
                            return next
                          }),
                      )
                    }}
                  >
                    <h3>{b.service}</h3>
                    {(
                      [
                        ['perMinute', '每分钟', b.usedMinute],
                        ['perHour', '每小时', b.usedHour],
                        ['perDay', '滚动24小时', b.usedDay],
                      ] as const
                    ).map(([key, label, used]) => (
                      <label key={key}>
                        {label}
                        <Input
                          aria-label={`${b.service}${label}限额`}
                          disabled={busy}
                          type="number"
                          min={0}
                          max={1000000}
                          required
                          value={value[key]}
                          onChange={(e) =>
                            setBudgetDrafts((prev) => {
                              const next = {
                                ...prev,
                                [b.service]: { ...value, [key]: Number(e.target.value) },
                              }
                              const d = next[b.service]
                              if (
                                d.perMinute === b.perMinute &&
                                d.perHour === b.perHour &&
                                d.perDay === b.perDay
                              )
                                delete next[b.service]
                              return next
                            })
                          }
                        />
                        <small>已用 {readingNumber(used)}</small>
                      </label>
                    ))}
                    <Button
                      variant="secondary"
                      className="secondary-button"
                      disabled={busy || !budgetDrafts[b.service]}
                    >
                      保存限额
                    </Button>
                  </form>
                )
              })}
            </div>
          </Card>
          <Card>
            <div className="reading-card-heading">
              <h2>近7天环节用量</h2>
              <label>
                筛选环节
                <Select
                  hideLabel
                  floating
                  label="筛选环节"
                  value={filter}
                  onChange={(selection) => {
                    setFilter(selection)
                    setPage(1)
                  }}
                  options={[
                    { value: '', label: '全部' },
                    ...report.capabilities.map((c) => ({ value: c.key, label: c.label })),
                  ]}
                />
              </label>
            </div>
            <div className="reading-table-wrap">
              <table className="reading-table">
                <thead>
                  <tr>
                    <th>环节</th>
                    <th>请求</th>
                    <th>成功率</th>
                    <th>失败 / 未知</th>
                    <th>P50 / P95</th>
                    <th>Token 输入 / 输出</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice((page - 1) * 10, page * 10).map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td>{readingNumber(c.usage.calls)}</td>
                      <td>
                        {c.usage.calls
                          ? `${((c.usage.ok / c.usage.calls) * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td>
                        {c.usage.failed} / {c.usage.unknown}
                      </td>
                      <td>
                        {c.usage.p50Ms === null ? '—' : `${c.usage.p50Ms}ms`} /{' '}
                        {c.usage.p95Ms === null ? '—' : `${c.usage.p95Ms}ms`}
                      </td>
                      <td>
                        {readingNumber(c.usage.tokensIn)} / {readingNumber(c.usage.tokensOut)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ReadingPager
              page={page}
              pageSize={10}
              total={rows.length}
              busy={busy}
              onPage={setPage}
              label="模型用量分页"
            />
          </Card>
        </>
      )}
    </div>
  )
}
