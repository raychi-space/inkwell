import { useEffect, useRef, useState } from 'react'
import { moveContentToTrash, purgeTrashedContent, recoverTrashedContent } from '../api'
import type { Article } from '../types'
import { errorMessage } from '../../../shared/lib/errors'

export type TrashActionKind = 'move' | 'recover' | 'purge'
const labels = { move: '移到回收站', recover: '恢复为草稿', purge: '永久删除' }
const explanations = {
  move: '内容将从公开站隐藏，正文、图片和历史版本保留，可以从回收站恢复。',
  recover: '正文、图片和历史版本将恢复到草稿箱，需要手动发布后访客才能阅读。',
  purge: '正文、所属图片和历史版本将永久删除，无法从回收站恢复。',
}

type Props = {
  kind: TrashActionKind
  id: string
  version: number
  title: string
  onClose: () => void
  onComplete: (article?: Article) => void
  onBusy: (busy: boolean) => void
}
export function TrashActionDialog({
  kind,
  id,
  version,
  title,
  onClose,
  onComplete,
  onBusy,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const controller = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
    return () => controller.current?.abort()
  }, [])
  async function commit() {
    if (controller.current) return
    const active = new AbortController()
    controller.current = active
    setPending(true)
    setError('')
    onBusy(true)
    try {
      let article: Article | undefined
      if (kind === 'move') await moveContentToTrash(id, version, active.signal)
      else if (kind === 'recover') article = await recoverTrashedContent(id, version, active.signal)
      else await purgeTrashedContent(id, version, active.signal)
      if (!active.signal.aborted) {
        onBusy(false)
        onComplete(article)
      }
    } catch (cause) {
      if (!active.signal.aborted) setError(errorMessage(cause))
    } finally {
      if (!active.signal.aborted) {
        controller.current = null
        setPending(false)
        onBusy(false)
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="publication-dialog trash-action-dialog"
      aria-labelledby="trash-action-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <h2 id="trash-action-title">{labels[kind]}？</h2>
      <p className="trash-item-title">{title || '无标题内容'}</p>
      <p>{explanations[kind]}</p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="actions">
        <button disabled={pending} onClick={onClose}>
          取消
        </button>
        <button
          className={kind === 'purge' ? 'danger' : 'primary'}
          disabled={pending}
          onClick={() => void commit()}
        >
          {pending ? '处理中…' : '确认' + labels[kind]}
        </button>
      </div>
    </dialog>
  )
}
export function MoveToTrash({
  article,
  disabled,
  onBusy,
  onMoved,
}: {
  article: Article
  disabled: boolean
  onBusy: (busy: boolean) => void
  onMoved: () => void
}) {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <button
        disabled={disabled}
        title={disabled ? '请先保存修改并等待当前操作完成' : undefined}
        onClick={() => setOpened(true)}
      >
        移到回收站
      </button>
      {opened && (
        <TrashActionDialog
          kind="move"
          id={article.id}
          version={article.version}
          title={article.title || '帖子'}
          onBusy={onBusy}
          onClose={() => setOpened(false)}
          onComplete={onMoved}
        />
      )}
    </>
  )
}
