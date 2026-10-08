import { useEffect, useRef, useState } from 'react'
import { exportContent } from '../api'
import { errorMessage } from '../../../shared/lib/errors'

export function ExportContent({
  id,
  version,
  dirty,
  disabled,
  onNotice,
}: {
  id: string
  version: number
  dirty: boolean
  disabled: boolean
  onNotice: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      active.current?.abort()
    },
    [id, version, dirty, disabled],
  )

  async function download() {
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    try {
      const blob = await exportContent(id, version, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `raychi-${id}-v${version}.zip`
      document.body.append(link)
      link.click()
      link.remove()
      // Keep the URL alive until the browser has started the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      onNotice('已导出已保存内容，包含工作稿、最近发布快照与图片。')
    } catch (error) {
      if (!controller.signal.aborted) onNotice(errorMessage(error))
    } finally {
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }
  return (
    <button
      disabled={disabled || dirty || busy}
      onClick={() => void download()}
      title={
        dirty
          ? '请先保存当前修改，再导出完整内容与图片。'
          : '导出已保存的工作稿、最近发布快照与图片。'
      }
    >
      {busy ? '正在导出…' : '导出已保存内容'}
    </button>
  )
}
