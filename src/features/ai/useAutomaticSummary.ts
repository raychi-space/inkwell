import { useEffect, useRef, useState } from 'react'
import { createTurn, getTurn } from './api'
import type { TurnRequest } from './types'
import { errorMessage } from '../../shared/errors'

interface Props {
  documentId: string | null
  assistantId: string
  title: string
  summary: string
  initialBody: string
  revision: number
  persisting: boolean
  isPersisting: () => boolean
  getMarkdown: () => string | null
  onApply: (summary: string) => void
}

/** Separate from conversation: no chat history, editor locks, or implicit save/publish. */
export function useAutomaticSummary(props: Props) {
  const latest = useRef(props)
  latest.current = props
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('')
  const [resumeRevision, setResumeRevision] = useState(0)
  const manual = useRef(false)
  const original = useRef({ id: props.documentId, body: props.initialBody, title: props.title, summary: props.summary })
  const attempted = useRef('')
  const changedSource = useRef(false)
  const cached = useRef<{ key: string; request: TurnRequest } | null>(null)
  if (original.current.id !== props.documentId) {
    original.current = { id: props.documentId, body: props.initialBody, title: props.title, summary: props.summary }
    attempted.current = ''
    cached.current = null
    changedSource.current = false
    manual.current = false
  }
  useEffect(() => {
    setPaused(false)
    setStatus('')
    setResumeRevision(0)
  }, [props.documentId])
  useEffect(() => {
    if (!props.documentId || paused || !props.assistantId || props.persisting) return
    const presentBody = props.getMarkdown()
    if (presentBody !== null && JSON.stringify([props.documentId, props.assistantId, props.title, presentBody]) !== attempted.current) setStatus('正文停顿后自动更新摘要')
    const controller = new AbortController()
    let requestKey = ''
    let settled = false
    const timer = window.setTimeout(() => void generate(), 4000)
    async function generate() {
      const current = latest.current
      const body = current.getMarkdown()
      if (body === null || !body.trim() || manual.current || controller.signal.aborted) return
      // Opening an existing summary is not itself an edit or a model request.
      if (body !== original.current.body || current.title !== original.current.title) changedSource.current = true
      if (!resumeRevision && !changedSource.current && original.current.summary) return
      const key = JSON.stringify([current.documentId, current.assistantId, current.title, body])
      if (attempted.current === key) return
      attempted.current = key
      requestKey = key
      setStatus('正在自动生成摘要…')
      const snapshot = { id: current.documentId, body, title: current.title, summary: current.summary }
      const request: TurnRequest = cached.current?.key === key && cached.current.request.context.currentSummary === current.summary ? cached.current.request : {
        requestId: crypto.randomUUID(), assistantId: current.assistantId, mode: 'summarize',
        message: '根据当前完整正文自动生成简洁摘要。', history: [],
        context: { title: snapshot.title, documentMarkdown: body, currentSummary: snapshot.summary },
      }
      cached.current = { key, request }
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(135000)])
      try {
        let created
        try {
          created = await createTurn(request, AbortSignal.any([signal, AbortSignal.timeout(15000)]))
        } catch (error) {
          if (signal.aborted) throw error
          // The first request may already have been accepted: repeat the exact request ID/payload.
          created = await createTurn(request, AbortSignal.any([signal, AbortSignal.timeout(15000)]))
        }
        let turn = await getTurn(created.turnId, signal)
        while (turn.status === 'pending' || turn.status === 'running') {
          await new Promise<void>((resolve, reject) => {
            const abort = () => { window.clearTimeout(wait); reject(signal.reason) }
            const wait = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 1000)
            signal.addEventListener('abort', abort, { once: true })
            if (signal.aborted) abort()
          })
          turn = await getTurn(created.turnId, signal)
        }
        if (turn.status === 'failed') throw new Error(turn.error?.message ?? '摘要生成失败。')
        const proposal = turn.result?.proposal
        if (proposal?.kind !== 'summary') throw new Error('摘要结果不合法。')
        const now = latest.current
        if (signal.aborted || manual.current || now.isPersisting() || now.documentId !== snapshot.id || now.assistantId !== request.assistantId || now.title !== snapshot.title || now.summary !== snapshot.summary || now.getMarkdown() !== snapshot.body) return
        settled = true
        now.onApply(proposal.summary)
        setStatus('摘要已自动更新')
      } catch (error) {
        if (!controller.signal.aborted && !manual.current) { settled = true; setStatus('自动摘要暂未更新：' + errorMessage(error) + ' 可以正常保存。') }
      }
    }
    return () => { window.clearTimeout(timer); controller.abort(); if (!settled && attempted.current === requestKey) attempted.current = '' }
  }, [props.documentId, props.assistantId, props.title, props.revision, props.persisting, paused, resumeRevision])
  return {
    paused,
    status: paused ? '本次编辑使用手动摘要' : !props.assistantId ? '配置助手后可自动生成摘要' : status || '正文停顿后自动更新摘要',
    pause() { manual.current = true; setPaused(true) },
    resume() { manual.current = false; attempted.current = ''; setPaused(false); setResumeRevision(v => v + 1) },
  }
}
