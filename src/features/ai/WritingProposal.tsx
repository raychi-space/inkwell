import { useMemo } from 'react'
import { diffChars } from 'diff'
import { MarkdownMessage } from '../../shared/ui/MarkdownMessage'

export type WritingSuggestion = {
  kind: 'replacement' | 'document' | 'insertion'
  before: string
  after: string
  state: 'pending' | 'accepted' | 'rejected' | 'expired'
}
export const suggestionStates = {
  pending: '待确认',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期',
}
const diffBudget = { maxEditLength: 1000, timeout: 40 }

export function WritingProposal({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: WritingSuggestion
  onAccept: () => void
  onReject: () => void
}) {
  const { before, after, state, kind } = suggestion
  // Bound work on complete-document rewrites as well as small selections.
  const parts = useMemo(
    () =>
      (before.length + after.length < 40000 ? diffChars(before, after, diffBudget) : undefined) ?? [
        { value: before, removed: true, added: false },
        { value: after, added: true, removed: false },
      ],
    [before, after],
  )
  const title =
    kind === 'document' ? '全文修改建议' : kind === 'insertion' ? '光标插入建议' : '选区修改建议'
  return (
    <section
      className="writing-proposal"
      role={state === 'pending' ? 'region' : 'group'}
      data-state={state}
      aria-label={`${title}：${suggestionStates[state]}`}
    >
      <header>
        <h3>{title}</h3>
        <span role="status">{suggestionStates[state]}</span>
      </header>
      <pre className="writing-diff" aria-label="修改对比">
        {parts.map((part, i) =>
          part.added ? (
            <ins key={i}>{part.value}</ins>
          ) : part.removed ? (
            <del key={i}>{part.value}</del>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </pre>
      {!after && <p>将删除所选内容。</p>}
      {after && (
        <details>
          <summary>{kind === 'insertion' ? '插入内容预览' : '修改后预览'}</summary>
          <MarkdownMessage content={after} />
        </details>
      )}
      {state === 'pending' && (
        <div className="actions">
          <button className="primary" onClick={onAccept}>
            {kind === 'insertion' ? '确认插入' : '接受'}
          </button>
          <button onClick={onReject}>拒绝</button>
        </div>
      )}
    </section>
  )
}
