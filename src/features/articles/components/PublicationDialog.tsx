import { useEffect, useRef } from 'react'

type Fields = { title: string; summary: string; slug: string }
export function PublicationDialog({
  fields,
  phase,
  error,
  pending,
  addressLocked,
  onChange,
  onClose,
  onRetry,
  onSubmit,
}: {
  fields: Fields
  phase: string
  error: string
  pending: boolean
  addressLocked: boolean
  onChange: (fields: Fields) => void
  onClose: () => void
  onRetry: () => void
  onSubmit: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      className="publication-dialog"
      ref={dialog}
      aria-labelledby="publication-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <h2 id="publication-title">发布预览</h2>
        <p role="status">
          {phase === 'saving'
            ? '正在保存工作稿…'
            : phase === 'generating'
              ? '正在生成标题、摘要和地址别名，请稍候…'
              : phase === 'publishing'
                ? '正在提交发布…'
                : '检查并编辑以下信息，确认后才会对外发布。'}
        </p>
        <fieldset disabled={pending}>
          <label htmlFor="publication-heading">
            发布标题
            <input
              required
              id="publication-heading"
              maxLength={200}
              value={fields.title}
              onChange={(e) => onChange({ ...fields, title: e.target.value })}
            />
          </label>
          <label htmlFor="publication-summary">
            摘要
            <textarea
              required
              id="publication-summary"
              rows={5}
              maxLength={600}
              value={fields.summary}
              onChange={(e) => onChange({ ...fields, summary: e.target.value })}
            />
          </label>
          <label htmlFor="publication-slug">
            地址别名
            <input
              required
              id="publication-slug"
              maxLength={120}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              readOnly={addressLocked}
              value={fields.slug}
              onChange={(e) => onChange({ ...fields, slug: e.target.value })}
            />
          </label>
          <small>
            {addressLocked
              ? '已发布文章保留原地址，旧链接继续可用。'
              : '默认取英文标题前五个单词，以连字符连接。可使用小写字母、数字和连字符。'}
          </small>
        </fieldset>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" disabled={pending} onClick={onClose}>
            取消
          </button>
          {phase === 'failed' && (
            <button type="button" onClick={onRetry}>
              重新生成
            </button>
          )}
          <button className="primary" type="submit" disabled={pending || phase !== 'ready'}>
            确认发布
          </button>
        </div>
      </form>
    </dialog>
  )
}
