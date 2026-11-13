import { useEffect, useRef, useState, type RefObject } from 'react'
import { createTurn, streamTurn } from './api'
import type {
  Assistant,
  EditorAgentAdapter,
  Proposal,
  SelectionSnapshot,
  InsertionSnapshot,
  TurnRequest,
} from './types'
import { Icon } from '../../shared/ui/Icon'
import { AssistantAvatar } from './AssistantAvatar'
import { Select } from '../../shared/ui/Select'
import { MarkdownMessage } from '../../shared/ui/MarkdownMessage'
import { WritingProposal, suggestionStates, type WritingSuggestion } from './WritingProposal'
import { errorMessage } from '../../shared/lib/errors'
interface Props {
  username?: string
  userAvatar?: string | null
  adapterRef: RefObject<EditorAgentAdapter | null>
  previewHost: RefObject<HTMLDivElement | null>
  title: string
  available: Assistant[]
  assistantId: string
  onAssistantChange: (id: string) => void
  onLock: (value: boolean) => void
  onBusy: (value: boolean) => void
}
interface Entry {
  requestId?: string
  name?: string
  icon?: string
  role: 'user' | 'assistant'
  content: string
  suggestion?: WritingSuggestion
}
export function WritingAssistant({
  username = '你',
  userAvatar,
  adapterRef,
  previewHost,
  title,
  available,
  assistantId,
  onAssistantChange,
  onLock,
  onBusy,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [message, setMessage] = useState(''),
    [notice, setNotice] = useState('')
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null),
    [insertion, setInsertion] = useState<InsertionSnapshot | null>(null),
    [proposal, setProposal] = useState<Proposal | null>(null)
  const [pending, setPending] = useState(false),
    [retry, setRetry] = useState<TurnRequest | null>(null)
  const proposalRequest = useRef<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const streamAbort = useRef<AbortController | null>(null)
  const documentTarget = useRef<{ id: string; before: string } | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const mounted = useRef(true),
    flight = useRef(false),
    proposalPending = useRef(false),
    decision = useRef(false),
    epoch = useRef(0)
  const historyHost = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onLock, onBusy, onAssistantChange })
  callbacks.current = { onLock, onBusy, onAssistantChange }
  const selectionState = useRef({ selection, insertion, proposal })
  selectionState.current = { selection, insertion, proposal }
  useEffect(() => {
    mounted.current = true
    return () => {
      streamAbort.current?.abort()
      mounted.current = false
      epoch.current++
      const target = selectionState.current
      if (target.selection) adapterRef.current?.releaseSelection(target.selection.selectionId)
      if (target.insertion) adapterRef.current?.releaseInsertion(target.insertion.insertionId)
      callbacks.current.onLock(false)
      callbacks.current.onBusy(false)
    }
  }, [])
  useEffect(() => {
    historyHost.current?.scrollTo({ top: historyHost.current.scrollHeight })
  }, [entries])
  useEffect(() => {
    let frame = 0
    function captureSelectedText() {
      frame = 0
      if (flight.current || proposalPending.current) return
      const host = previewHost.current
      const range = window.getSelection()
      if (
        !host ||
        !range ||
        !range.anchorNode ||
        !range.focusNode ||
        !host.contains(range.anchorNode) ||
        !host.contains(range.focusNode) ||
        !host.contains(document.activeElement) ||
        !document.activeElement?.closest('.editable-prose')
      )
        return
      if (range.isCollapsed) {
        if (selectionState.current.insertion) {
          const value = adapterRef.current?.captureInsertion()
          if (value) setInsertion(value)
          else {
            adapterRef.current?.releaseInsertion(selectionState.current.insertion.insertionId)
            setRetry(null)
            setNotice('当前位置不支持插入，请重新设置光标。')
          }
        }
        return
      }
      const value = adapterRef.current?.captureSelection()
      if (!value) {
        const previous = selectionState.current.selection
        if (previous) adapterRef.current?.releaseSelection(previous.selectionId)
        if (selectionState.current.insertion)
          adapterRef.current?.releaseInsertion(selectionState.current.insertion.insertionId)
        setSelection(null)
        setRetry(null)
        setNotice('请选择段落、标题、引用或列表中的文字；暂不支持表格、图片和代码块。')
        return
      }
      if (value.selectionId === selectionState.current.selection?.selectionId) return
      if (selectionState.current.insertion)
        adapterRef.current?.releaseInsertion(selectionState.current.insertion.insertionId)
      setInsertion(null)
      setSelection(value)
      setRetry(null)
      setNotice('')
    }
    function selectionChanged() {
      if (frame) cancelAnimationFrame(frame)
      // Read after Lexical has committed mouse and keyboard selection changes.
      frame = requestAnimationFrame(captureSelectedText)
    }
    document.addEventListener('selectionchange', selectionChanged)
    return () => {
      document.removeEventListener('selectionchange', selectionChanged)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [adapterRef, previewHost])
  function clearSelection() {
    if (selection) adapterRef.current?.releaseSelection(selection.selectionId)
    if (insertion) adapterRef.current?.releaseInsertion(insertion.insertionId)
    setSelection(null)
    setInsertion(null)
    callbacks.current.onLock(false)
  }
  function chooseInsertion() {
    const target = adapterRef.current?.captureInsertion()
    if (!target) {
      if (insertion) adapterRef.current?.releaseInsertion(insertion.insertionId)
      setRetry(null)
      setNotice('请先在正文中设置光标；可选择空段落或公式前后。')
      return
    }
    if (selection) adapterRef.current?.releaseSelection(selection.selectionId)
    setSelection(null)
    setInsertion(target)
    setRetry(null)
    setNotice('')
    composerRef.current?.focus()
  }
  function recordDecision(state: WritingSuggestion['state']) {
    proposalPending.current = false
    const requestId = proposalRequest.current
    setEntries((values) =>
      values.map((entry) =>
        entry.requestId === requestId && entry.suggestion
          ? { ...entry, suggestion: { ...entry.suggestion, state } }
          : entry,
      ),
    )
    setProposal(null)
    setRetry(null)
    clearSelection()
  }
  function showSuggestion(
    request: TurnRequest,
    proposed: Proposal,
    state: WritingSuggestion['state'] = 'pending',
  ) {
    if (
      proposed.kind !== 'replacement' &&
      proposed.kind !== 'document' &&
      proposed.kind !== 'insertion'
    )
      return
    proposalRequest.current = request.requestId
    const suggestion: WritingSuggestion = {
      kind: proposed.kind,
      before:
        proposed.kind === 'replacement'
          ? request.context.selection!.beforeMarkdown
          : proposed.kind === 'insertion'
            ? ''
            : (request.context.documentMarkdown ?? ''),
      after: proposed.newText,
      state,
    }
    setEntries((values) =>
      values.map((entry) =>
        entry.requestId === request.requestId ? { ...entry, suggestion } : entry,
      ),
    )
  }
  async function execute(request: TurnRequest, retrying = false) {
    if (flight.current || proposalPending.current) return
    if (
      request.mode === 'rewrite' &&
      (!request.context.selection ||
        !adapterRef.current?.validateSelection(request.context.selection.selectionId))
    ) {
      setNotice('原文已变化，请重新选择。')
      setRetry(null)
      clearSelection()
      return
    }
    if (
      request.mode === 'insert' &&
      (!request.context.insertion ||
        !adapterRef.current?.validateInsertion(request.context.insertion.insertionId))
    ) {
      setNotice('插入位置已变化，请重新设置光标。')
      setRetry(null)
      clearSelection()
      return
    }
    flight.current = true
    decision.current = false
    const runEpoch = ++epoch.current
    setPending(true)
    callbacks.current.onBusy(true)
    setNotice('正在执行…')
    setRetry(null)
    if (request.mode === 'rewrite') callbacks.current.onLock(true)
    if (!retrying)
      setEntries((v) => [
        ...(v.at(-1)?.role === 'user' ? v.slice(0, -1) : v),
        { role: 'user', content: request.message },
      ])
    try {
      const abort = new AbortController()
      streamAbort.current = abort
      const timeout = window.setTimeout(() => abort.abort(), 180000)
      const updateReply = (content: string) => {
        if (!mounted.current || runEpoch !== epoch.current) return
        const assistant = available.find((a) => a.id === request.assistantId)
        setEntries((values) => {
          const entry: Entry = {
            role: 'assistant',
            requestId: request.requestId,
            name: assistant?.name ?? '助手',
            icon: assistant?.icon,
            content,
          }
          const index = values.findIndex(
            (value) => value.role === 'assistant' && value.requestId === request.requestId,
          )
          return index < 0
            ? [...values, entry]
            : values.map((value, i) =>
                i === index ? { ...entry, suggestion: value.suggestion } : value,
              )
        })
      }
      let task
      try {
        const created = await createTurn(request, abort.signal)
        task = await streamTurn(
          created.turnId,
          (value) => {
            if (value.partialReply !== undefined) updateReply(value.partialReply || '正在思考…')
          },
          abort.signal,
        )
      } finally {
        window.clearTimeout(timeout)
        streamAbort.current = null
      }
      if (!mounted.current || runEpoch !== epoch.current) return
      if (task.status === 'failed') {
        updateReply('本轮失败：' + (task.error?.message ?? '执行失败。'))
        clearSelection()
        setNotice(task.error?.message ?? '执行失败。')
        return
      }
      const result = task.result
      if (!result) throw new Error('任务结果缺失。')
      updateReply(result.reply || '已生成建议，请确认。')
      setNotice('')
      const proposed = result.proposal
      if (proposed?.kind === 'insertion') {
        if (
          request.mode !== 'insert' ||
          proposed.insertionId !== request.context.insertion?.insertionId ||
          !proposed.newText.trim() ||
          proposed.newText.length > 100000 ||
          !adapterRef.current?.validateInsertion(proposed.insertionId)
        ) {
          showSuggestion(request, proposed, 'expired')
          clearSelection()
          setNotice('插入位置或内容已失效，请重新设置光标后生成。')
          return
        }
        // Stop queued native selection frames before React commits the pending card.
        proposalPending.current = true
        callbacks.current.onLock(true)
        showSuggestion(request, proposed)
        setProposal(proposed)
      } else if (proposed?.kind === 'replacement') {
        if (
          !['chat', 'rewrite'].includes(request.mode) ||
          proposed.selectionId !== request.context.selection?.selectionId ||
          !adapterRef.current?.validateSelection(proposed.selectionId)
        ) {
          if (request.context.selection) showSuggestion(request, proposed, 'expired')
          clearSelection()
          setNotice('原文已变化，请重新选择。')
          return
        }
        if (proposed.newText === request.context.selection.beforeMarkdown) {
          clearSelection()
          setNotice('没有修改。')
          return
        }
        proposalPending.current = true
        callbacks.current.onLock(true)
        showSuggestion(request, proposed)
        setProposal(proposed)
      } else if (proposed?.kind === 'document') {
        const target = documentTarget.current
        if (
          request.mode !== 'chat' ||
          !target ||
          target.id !== proposed.documentId ||
          adapterRef.current?.getCurrentMarkdown() !== target.before
        ) {
          showSuggestion(request, proposed, 'expired')
          setNotice('正文已变化，请重新生成修改建议。')
          return
        }
        if (target.before === proposed.newText) {
          setNotice('没有修改。')
          return
        }
        proposalPending.current = true
        callbacks.current.onLock(true)
        showSuggestion(request, proposed)
        setProposal(proposed)
      } else if (proposed) {
        clearSelection()
        setNotice('结果类型不匹配，请重新发送。')
      } else if (request.mode === 'insert') {
        clearSelection()
        setNotice('未生成有效插入建议，请重新发送。')
      } else if (
        !request.context.selection ||
        !adapterRef.current?.validateSelection(request.context.selection.selectionId)
      )
        clearSelection()
    } catch (e) {
      if (mounted.current && runEpoch === epoch.current) {
        setNotice(errorMessage(e))
        setRetry(request)
        callbacks.current.onLock(false)
      }
    } finally {
      if (mounted.current && runEpoch === epoch.current) {
        flight.current = false
        setPending(false)
        callbacks.current.onBusy(false)
      }
    }
  }
  function submit() {
    if (!assistantId || flight.current || proposalPending.current) return
    const content = message.trim()
    if (!content) {
      setNotice('请输入消息。')
      return
    }
    if (selection && !adapterRef.current?.validateSelection(selection.selectionId)) {
      clearSelection()
      setRetry(null)
      setNotice('原文已变化，请重新选择后发送。')
      return
    }
    if (insertion && !adapterRef.current?.validateInsertion(insertion.insertionId)) {
      clearSelection()
      setRetry(null)
      setNotice('插入位置已变化，请重新设置光标后发送。')
      return
    }
    if (!adapterRef.current) {
      setNotice('编辑器正在加载，请稍后发送。')
      return
    }
    const documentId = crypto.randomUUID()
    documentTarget.current = {
      id: documentId,
      before: adapterRef.current?.getCurrentMarkdown() ?? '',
    }
    const request: TurnRequest = {
      requestId: crypto.randomUUID(),
      assistantId,
      mode: insertion ? 'insert' : 'chat',
      message: content,
      history: (entries.at(-1)?.role === 'user' ? entries.slice(0, -1) : entries)
        .slice(-40)
        .map(({ role, content, suggestion }) => ({
          role,
          content:
            content + (suggestion ? `\n[修改建议状态：${suggestionStates[suggestion.state]}]` : ''),
        })),
      context: {
        title,
        ...(!insertion ? { documentId } : {}),
        documentMarkdown: adapterRef.current?.getCurrentMarkdown() ?? '',
        ...(selection ? { selection } : {}),
        ...(insertion ? { insertion } : {}),
      },
    }
    setMessage('')
    void execute(request)
  }
  function accept() {
    if (decision.current || !proposal) return
    decision.current = true
    try {
      if (proposal.kind === 'replacement') {
        if (!adapterRef.current) throw new Error('编辑器已重新加载，请重新选择。')
        adapterRef.current.applyReplacement(proposal.selectionId, proposal.newText)
      } else if (proposal.kind === 'insertion') {
        if (!adapterRef.current) throw new Error('编辑器已重新加载，请重新设置光标。')
        adapterRef.current.applyInsertion(proposal.insertionId, proposal.newText)
      } else if (proposal.kind === 'document' && documentTarget.current) {
        if (!adapterRef.current) throw new Error('编辑器已重新加载，请重新生成。')
        adapterRef.current.applyDocument(documentTarget.current.before, proposal.newText)
      } else throw new Error('结果类型不匹配。')
      recordDecision('accepted')
    } catch (e) {
      setNotice(errorMessage(e))
      recordDecision('expired')
    }
  }
  return (
    <section className="card writing-assistant" aria-label="写作对话">
      <header className="conversation-head">
        <h2>写作对话</h2>
        <Select
          floating
          label="选择助手"
          disabled={pending || !!proposal}
          value={assistantId}
          onChange={(id) => {
            if (!pending && !proposal) {
              callbacks.current.onAssistantChange(id)
            }
          }}
          options={available.map((v) => ({
            value: v.id,
            label: v.name,
            icon: <AssistantAvatar icon={v.icon} size={18} />,
          }))}
        />
      </header>
      <div className="agent-history" ref={historyHost} aria-live="polite" aria-label="对话记录">
        {!entries.length && (
          <div className="conversation-empty">
            <strong>聊聊这篇文章</strong>
            <p>
              {available.length
                ? '助手可以阅读当前全文。可以选中文字修改，也可以设置光标后选择“写入光标处”；建议确认后应用。'
                : '请先在助手管理中配置并启用助手。'}
            </p>
          </div>
        )}
        {entries.map((v, i) => (
          <div key={i} className={'chat-entry ' + v.role}>
            <div className="chat-identity">
              {v.role === 'assistant' ? (
                <AssistantAvatar icon={v.icon} size={20} />
              ) : userAvatar ? (
                <img
                  src={userAvatar}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <Icon name="user" size={20} />
              )}
              <span>{v.role === 'user' ? username : (v.name ?? '助手')}</span>
            </div>
            <div className={'agent-message ' + v.role}>
              {v.role === 'assistant' ? (
                <MarkdownMessage content={v.content} />
              ) : (
                <p>{v.content}</p>
              )}
              {v.suggestion && (
                <WritingProposal
                  suggestion={v.suggestion}
                  onAccept={accept}
                  onReject={() => recordDecision('rejected')}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className={'conversation-composer' + (expanded ? ' expanded' : '')}>
        {insertion && (
          <div className="agent-selection" role="region" aria-label="光标插入位置">
            <small>写入光标处</small>
            <p>
              {insertion.contextBefore.slice(-50) || '文档开头'}｜
              {insertion.contextAfter.slice(0, 50) || '文档末尾'}
            </p>
            <button disabled={pending || !!proposal} onClick={clearSelection}>
              取消插入
            </button>
          </div>
        )}
        {selection && (
          <div className="agent-selection" role="region" aria-label="已选中选区">
            <small>已选中选区</small>
            <p>
              {selection.beforeMarkdown.slice(0, 100)}
              {selection.beforeMarkdown.length > 100 ? '…' : ''}
            </p>
            <button disabled={pending || !!proposal} onClick={clearSelection}>
              移除引用
            </button>
          </div>
        )}
        <div className="composer-input">
          <textarea
            ref={composerRef}
            aria-label="消息"
            rows={expanded ? 10 : 3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={pending || !!proposal}
            placeholder={expanded ? '输入长消息，回车换行…' : '输入消息，回车发送…'}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
              if (
                e.key === 'Enter' &&
                (e.metaKey || e.ctrlKey || (!expanded && !e.shiftKey && !e.altKey))
              ) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button
            type="button"
            className="composer-expand"
            aria-label={expanded ? '收起输入框' : '展开输入框'}
            title={expanded ? '收起输入框' : '展开输入框'}
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((value) => !value)
              composerRef.current?.focus()
            }}
          >
            <Icon name={expanded ? 'contract' : 'expand'} size={16} />
          </button>
        </div>
        <div className="agent-actions">
          <button
            disabled={pending || !!proposal || !assistantId}
            onMouseDown={(e) => e.preventDefault()}
            onClick={chooseInsertion}
            aria-pressed={!!insertion}
          >
            写入光标处
          </button>
          <button
            className="primary"
            disabled={pending || !!proposal || !assistantId}
            onClick={submit}
          >
            {pending ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
      {notice && (
        <div className="conversation-toast" role="status">
          <span>{notice}</span>
          {retry && (
            <button disabled={pending || !!proposal} onClick={() => void execute(retry, true)}>
              重试
            </button>
          )}
          <button className="toast-close" aria-label="关闭提示" onClick={() => setNotice('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </section>
  )
}
