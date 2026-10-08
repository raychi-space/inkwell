import { useEffect, useState } from 'react'
import { listTrashedContent } from '../api'
import type { Article, Page, TrashItem } from '../types'
import { errorMessage } from '../../../shared/lib/errors'
import { TrashActionDialog, type TrashActionKind } from './TrashAction'

export function TrashDashboard({
  busy,
  notice,
  onBusy,
  onRecovered,
  onNotice,
}: {
  busy: boolean
  notice: string
  onBusy: (busy: boolean) => void
  onRecovered: (article: Article) => void
  onNotice: (message: string) => void
}) {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Page<TrashItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<{ item: TrashItem; kind: TrashActionKind } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setResult(null)
    setError('')
    void listTrashedContent(page, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        if (page > 1 && value.items.length === 0) setPage(page - 1)
        else setResult(value)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, retry])
  function close() {
    setSelected(null)
    setRetry((value) => value + 1)
  }
  return (
    <main className="workspace studio-page dashboard-page">
      <header className="studio-head dashboard-head">
        <div>
          <p className="eyebrow">CONTENT STUDIO</p>
          <h1>回收站</h1>
          <p>已移除的内容保留在这里，不会自动清空。恢复后为草稿，需要手动发布。</p>
        </div>
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading && <p role="status">加载回收站…</p>}
      {error && (
        <div role="alert">
          <p className="notice">{error}</p>
          <button disabled={busy} onClick={() => setRetry((value) => value + 1)}>
            重新加载
          </button>
        </div>
      )}
      {result && (
        <>
          <p>
            共 {result.total} 条 · 第 {result.page} 页
          </p>
          {result.items.length === 0 && <p>回收站为空。</p>}
          <ul className="trash-list">
            {result.items.map((item) => (
              <li className="trash-item" key={item.id}>
                <div>
                  <h2 className="trash-item-title">
                    {item.title || (item.type === 'POST' ? '无标题帖子' : '无标题文章')}
                  </h2>
                  <p>
                    {item.type === 'ARTICLE' ? '文章' : '帖子'} · 移入时间{' '}
                    {new Date(item.trashedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                <div className="actions">
                  <button disabled={busy} onClick={() => setSelected({ item, kind: 'recover' })}>
                    恢复为草稿
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => setSelected({ item, kind: 'purge' })}
                  >
                    永久删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button disabled={busy || page === 1} onClick={() => setPage((value) => value - 1)}>
              上一页
            </button>
            <button
              disabled={busy || page * 20 >= result.total}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
      {selected && (
        <TrashActionDialog
          {...selected.item}
          kind={selected.kind}
          onBusy={onBusy}
          onClose={close}
          onComplete={(article) => {
            if (article) onRecovered(article)
            else {
              close()
              onNotice('已永久删除该内容。')
            }
          }}
        />
      )}
    </main>
  )
}
