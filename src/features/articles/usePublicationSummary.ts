import { useEffect, useRef } from 'react'
import { getArticle } from './api'
import type { Article } from './types'
import type { Dispatch, SetStateAction, RefObject } from 'react'

type Options = {
  current: Article | null
  busy: boolean
  saving: RefObject<boolean>
  setCurrent: Dispatch<SetStateAction<Article | null>>
  setSummary: Dispatch<SetStateAction<string>>
  setNotice: Dispatch<SetStateAction<string>>
}

export function usePublicationSummary({
  current,
  busy,
  saving,
  setCurrent,
  setSummary,
  setNotice,
}: Options) {
  const currentRef = useRef(current)
  currentRef.current = current
  // Poll persisted publication work only; typing, pausing and draft saving never create model tasks.
  useEffect(() => {
    if (!current || !['PENDING', 'RUNNING'].includes(current.summaryStatus ?? '') || busy) return
    let active = true
    let timer = 0
    const id = current.id
    async function poll() {
      try {
        const fresh = await getArticle(id)
        const before = currentRef.current
        if (!active || saving.current || before?.id !== id) return
        // Only the server's summary update may advance the local version silently.
        if (
          fresh.updatedAt !== before.updatedAt ||
          fresh.publicUpdatedAt !== before.publicUpdatedAt
        ) {
          setNotice('内容已在其他位置更新，请重新打开后继续编辑。')
          return
        }
        setCurrent(fresh)
        setSummary(fresh.summary)
        if (['PENDING', 'RUNNING'].includes(fresh.summaryStatus ?? ''))
          timer = window.setTimeout(() => void poll(), 1500)
      } catch {
        if (active) timer = window.setTimeout(() => void poll(), 3000)
      }
    }
    timer = window.setTimeout(() => void poll(), 1000)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [current?.id, current?.summaryStatus, busy, saving, setCurrent, setSummary, setNotice])
}
