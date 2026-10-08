import { useEffect, useRef, useState } from 'react'
import { contentRevision, contentRevisions, restoreContentRevision } from '../api'
import type { Article, ContentRevision, ContentRevisionSummary, Page } from '../types'
import { errorMessage } from '../../../shared/lib/errors'

const operations: Record<string, string> = {
  BASELINE: '原有工作稿基线',
  CREATE: '创建',
  SAVE: '保存',
  PUBLISH: '发布',
  UNPUBLISH: '撤回',
  SUMMARY: '自动摘要',
  RESTORE: '历史恢复',
}
type Props = {
  article: Article
  dirty: boolean
  disabled: boolean
  onRestored: (article: Article) => void
  onBusy: (busy: boolean) => void
  onNotice: (message: string) => void
}

export function ContentHistory(props: Props) {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <button disabled={props.disabled} onClick={() => setOpened(true)}>
        历史版本
      </button>
      {opened && <HistoryDialog {...props} onClose={() => setOpened(false)} />}
    </>
  )
}

function HistoryDialog({
  article,
  dirty,
  disabled,
  onRestored,
  onBusy,
  onNotice,
  onClose,
}: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const active = useRef<AbortController | null>(null)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Page<ContentRevisionSummary> | null>(null)
  const [selected, setSelected] = useState<ContentRevision | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    dialog.current?.showModal()
    return () => {
      active.current?.abort()
    }
  }, [])
  useEffect(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setLoading(true)
    setError('')
    setSelected(null)
    setConfirming(false)
    void contentRevisions(article.id, page, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult(value)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [article.id, page, retry])

  async function choose(id: string) {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setLoading(true)
    setSelected(null)
    setConfirming(false)
    setError('')
    try {
      const value = await contentRevision(article.id, id, controller.signal)
      if (!controller.signal.aborted) setSelected(value)
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  async function restore() {
    if (!selected || dirty || disabled || pending) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    onBusy(true)
    setError('')
    try {
      const restored = await restoreContentRevision(
        article.id,
        selected.id,
        article.version,
        controller.signal,
      )
      if (!controller.signal.aborted) {
        onRestored(restored)
        onNotice('历史版本已恢复为工作稿，公开内容未改变。')
        onClose()
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause))
    } finally {
      if (!controller.signal.aborted) setPending(false)
      onBusy(false)
    }
  }
  return (
    <dialog
      className="publication-dialog content-history-dialog"
      ref={dialog}
      aria-labelledby="history-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <h2 id="history-title">历史版本</h2>
      <p>保留最近100条工作稿修订。恢复后需要手动发布，公开版本不会改变；图片沿用现有附件。</p>
      {dirty && <p>当前修改尚未保存，请先保存后再恢复。</p>}
      {loading && <p role="status">正在加载历史版本…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button disabled={pending} onClick={() => setRetry((value) => value + 1)}>
            重新加载
          </button>
        </div>
      )}
      <ol className="history-list">
        {result?.items.map((item) => (
          <li key={item.id}>
            <button
              disabled={pending || loading}
              aria-pressed={selected?.id === item.id}
              onClick={() => void choose(item.id)}
            >
              <strong>
                v{item.articleVersion} · {operations[item.operation] ?? item.operation}
              </strong>
              <span>{item.title || '未命名内容'}</span>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString('zh-CN')}
              </time>
            </button>
          </li>
        ))}
      </ol>
      {result && result.total === 0 && !loading && (
        <p>还没有修订记录。下一次保存前会记录现有工作稿基线。</p>
      )}
      {result && result.total > 20 && (
        <div className="actions" aria-label="历史分页">
          <button
            disabled={page === 1 || loading || pending}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </button>
          <span>
            第{page}页 · 共{result.total}条
          </span>
          <button
            disabled={page * 20 >= result.total || loading || pending}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      )}
      {selected && (
        <section aria-label="修订预览">
          <h3>
            v{selected.articleVersion} · {selected.title || '未命名内容'}
          </h3>
          <p>{selected.snapshot.summary}</p>
          <p>
            {selected.snapshot.category ?? '帖子'}
            {selected.snapshot.tags.map((tag) => ' · #' + tag).join('')}
          </p>
          <pre aria-label="历史正文">{selected.snapshot.bodyMarkdown}</pre>
        </section>
      )}
      {confirming && <p role="status">确认用所选版本替换当前工作稿？当前公开版本保持原样。</p>}
      <div className="actions">
        <button disabled={pending} onClick={onClose}>
          关闭历史
        </button>
        {confirming ? (
          <>
            <button disabled={pending} onClick={() => setConfirming(false)}>
              取消恢复
            </button>
            <button
              className="primary"
              disabled={pending || dirty || disabled}
              onClick={() => void restore()}
            >
              {pending ? '正在恢复…' : '确认恢复工作稿'}
            </button>
          </>
        ) : (
          <button
            className="primary"
            disabled={!selected || loading || dirty || disabled || pending}
            onClick={() => setConfirming(true)}
          >
            恢复到工作稿
          </button>
        )}
      </div>
    </dialog>
  )
}
