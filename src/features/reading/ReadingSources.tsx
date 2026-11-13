import { useSessionState } from '../../shared/lib/useSessionState'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../shared/lib/errors'
import {
  aihotSources,
  aihotSource,
  createAihotSource,
  updateAihotSource,
  checkAihotSource,
  collectAihotSource,
  type AihotSourcePage,
  type AihotSourceDetail,
  type SourceDraft,
} from './management-api'
import { ReadingPager, readingTime, healthStatus } from './ManagementParts'

type Draft = SourceDraft & { id?: string; version?: string; enabled: boolean }
const blank = (): Draft => ({ name: '', feedUrl: '', intervalMinutes: 30, enabled: true })
const fromSource = (s: AihotSourceDetail): Draft => ({
  id: s.id,
  name: s.name,
  feedUrl: s.feedUrl,
  intervalMinutes: s.intervalMinutes,
  enabled: s.enabled,
  version: s.version,
})
export function ReadingSources({
  refresh,
  onDirty,
  onBusy,
}: {
  refresh: number
  onDirty: (value: boolean) => void
  onBusy: (value: boolean) => void
}) {
  const [result, setResult] = useState<AihotSourcePage | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const [search, setSearch] = useSessionState('reading.sources.search', ''),
    [query, setQuery] = useSessionState('reading.sources.query', ''),
    [enabled, setEnabled] = useSessionState('reading.sources.enabled', ''),
    [health, setHealth] = useSessionState('reading.sources.health', ''),
    [page, setPage] = useSessionState('reading.sources.page', 1)
  const [draft, setDraft] = useState<Draft | null>(null),
    [original, setOriginal] = useState(''),
    [revision, setRevision] = useState(0)
  const dirty = draft !== null && JSON.stringify(draft) !== original
  const generation = useRef(0),
    alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    setDraft(null)
    setOriginal('')
  }, [refresh])
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  useEffect(() => {
    const current = ++generation.current
    setBusy(true)
    setError('')
    void aihotSources({ q: query, enabled, health, page })
      .then((value) => {
        if (generation.current === current) setResult(value)
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
  }, [refresh, query, enabled, health, page, revision])
  const discard = () => !dirty || window.confirm('当前来源有未保存的修改，确定放弃吗？')
  function clearDraft() {
    setDraft(null)
    setOriginal('')
  }
  function edit(value: Draft) {
    setDraft(value)
    setOriginal(JSON.stringify(value))
    setNotice('')
  }
  async function operation<T>(fn: () => Promise<T>, done: (value: T) => void) {
    setBusy(true)
    setError('')
    setNotice('')
    onBusy(true)
    try {
      const value = await fn()
      if (alive.current) done(value)
    } catch (e) {
      if (alive.current) setError(errorMessage(e))
    } finally {
      if (alive.current) setBusy(false)
      onBusy(false)
    }
  }
  async function open(id: string) {
    if (!discard()) return
    await operation(
      () => aihotSource(id),
      (value) => edit(fromSource(value)),
    )
  }
  async function save() {
    if (!draft) return
    const body = {
      name: draft.name.trim(),
      feedUrl: draft.feedUrl.trim(),
      intervalMinutes: Number(draft.intervalMinutes),
    }
    await operation(
      () =>
        draft.id
          ? updateAihotSource(draft.id, {
              ...body,
              enabled: draft.enabled,
              version: draft.version!,
            })
          : createAihotSource(body),
      (value) => {
        edit(fromSource(value))
        setNotice('来源已保存。')
        setRevision((v) => v + 1)
      },
    )
  }
  const changeFilter = (apply: () => void) => {
    if (!busy && discard()) {
      clearDraft()
      setPage(1)
      apply()
    }
  }
  return (
    <div className="reading-panel">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="dashboard-card">
        <div className="reading-card-heading">
          <h2>RSS 来源</h2>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              if (discard()) edit(blank())
            }}
          >
            新增来源
          </button>
        </div>
        <form
          className="reading-filters"
          onSubmit={(e) => {
            e.preventDefault()
            changeFilter(() => setQuery(search.trim()))
          }}
        >
          <label>
            搜索来源
            <input
              disabled={busy}
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            启用状态
            <select
              aria-label="启用状态"
              disabled={busy}
              value={enabled}
              onChange={(e) => changeFilter(() => setEnabled(e.target.value))}
            >
              <option value="">全部</option>
              <option value="true">已启用</option>
              <option value="false">已暂停</option>
            </select>
          </label>
          <label>
            健康状态
            <select
              aria-label="健康状态"
              disabled={busy}
              value={health}
              onChange={(e) => changeFilter(() => setHealth(e.target.value))}
            >
              <option value="">全部</option>
              {Object.entries(healthStatus).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" disabled={busy}>
            查询
          </button>
        </form>
        {busy && <p role="status">正在查询或保存来源…</p>}
        <div className="reading-table-wrap">
          <table className="reading-table reading-source-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>启用</th>
                <th>健康</th>
                <th>间隔</th>
                <th>最近成功</th>
                <th>最近异常</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {result?.items.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.enabled ? '已启用' : '已暂停'}</td>
                  <td>{healthStatus[s.health] ?? s.health}</td>
                  <td>{s.intervalMinutes} 分钟</td>
                  <td>{readingTime(s.lastSuccessAt)}</td>
                  <td>{s.lastError ?? '—'}</td>
                  <td>
                    <div className="reading-row-actions">
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void open(s.id)}
                      >
                        编辑
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          void operation(
                            () => checkAihotSource(s.id),
                            (r) =>
                              setNotice(
                                `${s.name}：发现 ${r.count} 条，耗时 ${r.elapsedMs}ms；未保存内容。`,
                              ),
                          )
                        }
                      >
                        检查RSS
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy || !s.enabled}
                        onClick={() =>
                          void operation(
                            () => collectAihotSource(s.id),
                            (r) => {
                              setNotice(
                                r.jobId ? '采集任务已提交。' : '已有采集任务，无需重复提交。',
                              )
                              setRevision((v) => v + 1)
                            },
                          )
                        }
                      >
                        立即采集
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {result && !result.items.length && (
                <tr>
                  <td colSpan={7}>没有匹配的来源。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {result && (
          <ReadingPager
            {...result}
            busy={busy}
            onPage={(value) => changeFilter(() => setPage(value))}
            label="来源分页"
          />
        )}
      </section>
      {draft && (
        <section className="dashboard-card">
          <h2>{draft.id ? '编辑来源' : '新增RSS来源'}</h2>
          <form
            className="reading-source-form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <fieldset disabled={busy}>
              <label>
                来源名称
                <input
                  required
                  maxLength={200}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                RSS 地址
                <input
                  type="url"
                  required
                  maxLength={2048}
                  value={draft.feedUrl}
                  onChange={(e) => setDraft({ ...draft, feedUrl: e.target.value })}
                  placeholder="https://example.com/feed.xml"
                />
              </label>
              <label>
                采集间隔（分钟）
                <input
                  type="number"
                  required
                  min={1}
                  max={1440}
                  value={draft.intervalMinutes}
                  onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) })}
                />
              </label>
              {draft.id && (
                <label className="reading-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  />
                  启用来源
                </label>
              )}
              <div className="reading-row-actions">
                <button className="primary-button" disabled={!dirty}>
                  {draft.id ? '保存来源' : '新增并启用'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (discard()) clearDraft()
                  }}
                >
                  取消
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </div>
  )
}
