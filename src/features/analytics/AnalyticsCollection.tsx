import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../../shared/lib/errors'
import { analyticsSettings, saveAnalyticsSettings, type AnalyticsSettings } from './api'

export function AnalyticsCollection() {
  const [settings, setSettings] = useState<AnalyticsSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const request = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const value = await analyticsSettings(controller.signal)
      if (!controller.signal.aborted) setSettings(value)
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => request.current?.abort()
  }, [load])

  async function toggle() {
    if (!settings || busy || !settings.configured) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const value = await saveAnalyticsSettings(
        { enabled: !settings.enabled, version: settings.version },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setSettings(value)
      setMessage(value.enabled ? '已开启访问采集。' : '已关闭访问采集。')
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(errorMessage(failure))
      // A failed/ambiguous write must be reloaded before another toggle.
      setSettings(null)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section
      className="dashboard-card analytics-collection"
      aria-labelledby="analytics-collection-title"
    >
      <div className="analytics-collection-control">
        <div>
          <h2 id="analytics-collection-title">访问采集</h2>
          <p>关闭后停止记录新访问，历史报表仍可查询。</p>
        </div>
        <button
          type="button"
          className="primary"
          role="switch"
          aria-label="访问采集"
          aria-checked={Boolean(settings?.configured && settings.enabled)}
          disabled={busy || !settings?.configured}
          onClick={() => void toggle()}
        >
          {busy ? '正在处理…' : settings?.configured && settings.enabled ? '关闭采集' : '开启采集'}
        </button>
      </div>
      {settings && !settings.configured && <p role="status">访问统计尚未配置，暂时无法开启。</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void load()}
          >
            重新加载设置
          </button>
        </div>
      )}
    </section>
  )
}
