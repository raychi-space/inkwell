import { useEffect, useRef, useState } from 'react'
import { saveArticle, publishArticle, type Article } from '../features/articles'
import { createTurn, getTurn } from '../features/ai/api'
import { ApiError } from '../shared/api/client'
import { errorMessage } from '../shared/lib/errors'

export type PublicationFields = { title: string; summary: string; slug: string }
type Phase = 'saving' | 'generating' | 'ready' | 'failed' | 'publishing'

export function usePublicationFlow({
  current,
  dirty,
  assistantId,
  saveDraft,
  onStored,
  onPublished,
  onNotice,
}: {
  current: Article | null
  dirty: boolean
  assistantId: string
  saveDraft: () => Promise<Article | null>
  onStored: (article: Article) => void
  onPublished: (article: Article) => void
  onNotice: (message: string) => void
}) {
  const [opened, setOpened] = useState(false)
  const [phase, setPhase] = useState<Phase>('ready')
  const [fields, setFields] = useState<PublicationFields>({ title: '', summary: '', slug: '' })
  const [error, setError] = useState('')
  const active = useRef(false)
  const prepared = useRef<Article | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const pending = phase === 'saving' || phase === 'generating' || phase === 'publishing'

  async function prepare(preview: boolean) {
    if (active.current || !current) return
    active.current = true
    setError('')
    setOpened(preview)
    setPhase('saving')
    setFields({ title: current.title, summary: current.summary, slug: current.slug })
    try {
      if (
        !dirty &&
        prepared.current?.id === current.id &&
        prepared.current.version === current.version
      ) {
        setFields(prepared.current)
        setPhase('ready')
        return
      }
      prepared.current = null
      const saved = await saveDraft()
      if (!saved) throw new Error('工作稿保存失败，请关闭预览并检查编辑区提示。')
      setFields(saved)
      if (saved.type !== 'ARTICLE') {
        prepared.current = saved
        setPhase('ready')
        return
      }
      if (!assistantId) throw new Error('工作稿已保存。请先选择已启用的写作助手，再生成发布信息。')
      setPhase('generating')
      onNotice('工作稿已保存，正在生成标题、摘要和地址别名…')
      const abort = new AbortController()
      controller.current = abort
      const timeout = window.setTimeout(() => abort.abort(), 180_000)
      try {
        let turn = await createTurn(
          {
            requestId: crypto.randomUUID(),
            assistantId,
            mode: 'metadata',
            message:
              '根据正文生成发布标题和摘要。将标题翻译为英文，用于生成地址别名。保留原文含义，不添加事实。',
            history: [],
            context: { title: saved.title.slice(0, 200), documentMarkdown: saved.bodyMarkdown },
          },
          abort.signal,
        )
        while (turn.status === 'pending' || turn.status === 'running') {
          await new Promise((resolve) => window.setTimeout(resolve, 1000))
          if (abort.signal.aborted) throw new Error('生成已取消或超时，工作稿已保留，请重试。')
          turn = await getTurn(turn.turnId, abort.signal)
        }
        const proposal = turn.result?.proposal
        if (turn.status !== 'succeeded' || proposal?.kind !== 'metadata')
          throw new Error(turn.error?.message || '模型未返回完整的发布信息，请重试。')
        const metadata = {
          title: proposal.title,
          summary: proposal.summary,
          slug: saved.publishedAt ? saved.slug : proposal.slug,
        }
        setFields(metadata)
        let stored: Article
        try {
          stored = await saveArticle(saved.id, { ...saved, ...metadata, publicationMetadata: true })
        } catch (cause) {
          if (!(cause instanceof ApiError) || cause.code !== 'SLUG_CONFLICT' || saved.publishedAt)
            throw cause
          metadata.slug =
            metadata.slug.slice(0, 100).replace(/-+$/, '') + '-' + saved.id.slice(0, 8)
          stored = await saveArticle(saved.id, { ...saved, ...metadata, publicationMetadata: true })
          setFields(metadata)
        }
        onStored(stored)
        prepared.current = stored
        setPhase('ready')
        onNotice('工作稿和发布信息已保存。点击发布可预览并修改，确认后才会公开。')
      } finally {
        window.clearTimeout(timeout)
        controller.current = null
      }
    } catch (cause) {
      const message = errorMessage(cause)
      setError(message)
      onNotice(message)
      setPhase('failed')
    } finally {
      active.current = false
    }
  }

  async function submit() {
    const article = prepared.current
    if (active.current || phase !== 'ready' || !article) return
    active.current = true
    setPhase('publishing')
    setError('')
    try {
      const stored = await saveArticle(article.id, {
        ...article,
        ...fields,
        publicationMetadata: true,
      })
      prepared.current = stored
      onStored(stored)
      const published = await publishArticle(stored.id, stored.version, undefined, true)
      prepared.current = published
      onPublished(published)
      setOpened(false)
      setPhase('ready')
    } catch (cause) {
      setError(errorMessage(cause))
      setPhase('ready')
    } finally {
      active.current = false
    }
  }

  return {
    opened,
    phase,
    fields,
    error,
    pending,
    setFields,
    prepare,
    submit,
    close: () => {
      if (!active.current) setOpened(false)
    },
  }
}
