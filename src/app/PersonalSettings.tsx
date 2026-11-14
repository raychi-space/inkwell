import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChangePassword, changeUsername } from '../features/auth'
import { getSettings, type SiteSettings } from '../features/settings'
import { saveAvatar } from '../features/settings/api'
import { PageHeader } from '../shared/ui/PageHeader'
import { Icon } from '../shared/ui/Icon'
import { errorMessage } from '../shared/lib/errors'

type Props = {
  username: string
  initialValue: SiteSettings | null
  onSaved: (value: SiteSettings) => void
  onSessionEnd: (notice: string) => void
  onDirtyChange: (value: boolean) => void
  onBusyChange: (value: boolean) => void
}
export function PersonalSettings(p: Props) {
  const [tab, setTab] = useState<'avatar' | 'username' | 'password'>('avatar')
  const [settings, setSettings] = useState(p.initialValue)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [failed, setFailed] = useState(false)
  const [username, setUsername] = useState(p.username)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const settingsGeneration = useRef(0)
  const dirty = !!file || username !== p.username || !!password || passwordDirty
  const pending = busy || passwordBusy
  useEffect(() => {
    let active = true
    const request = ++settingsGeneration.current
    void getSettings()
      .then((v) => {
        if (active && request === settingsGeneration.current) setSettings(v)
      })
      .catch((e) => {
        if (active && request === settingsGeneration.current) setNotice(errorMessage(e))
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!file) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    setFailed(false)
  }, [preview, settings?.avatarUrl])
  useEffect(() => {
    p.onDirtyChange(dirty)
    return () => p.onDirtyChange(false)
  }, [dirty, p.onDirtyChange])
  useEffect(() => {
    p.onBusyChange(pending)
    return () => p.onBusyChange(false)
  }, [pending, p.onBusyChange])
  function reset() {
    setFile(null)
    setUsername(p.username)
    setPassword('')
    setNotice('')
    setGeneration((v) => v + 1)
    if (input.current) input.current.value = ''
  }
  function selectTab(next: typeof tab) {
    if (next === tab || pending || (dirty && !window.confirm('当前修改尚未保存，确定放弃吗？')))
      return
    reset()
    setTab(next)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    settingsGeneration.current++
    setBusy(true)
    setNotice('')
    try {
      if (tab === 'avatar' && file && settings) {
        const saved = await saveAvatar(file, settings.version)
        setSettings(saved)
        p.onSaved(saved)
        setFile(null)
        if (input.current) input.current.value = ''
        setNotice('头像已保存。')
      } else if (tab === 'username') {
        await changeUsername(password, username)
        setPassword('')
        p.onSessionEnd('用户名已修改，请使用新用户名重新登录。')
      }
    } catch (e) {
      setNotice(errorMessage(e))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  async function refresh() {
    if (pending || (dirty && !window.confirm('当前修改尚未保存，确定放弃并刷新吗？'))) return
    reset()
    const request = ++settingsGeneration.current
    setBusy(true)
    try {
      const value = await getSettings(true)
      if (request === settingsGeneration.current) {
        setSettings(value)
        p.onSaved(value)
      }
    } catch (e) {
      if (request === settingsGeneration.current) setNotice(errorMessage(e))
    } finally {
      if (request === settingsGeneration.current) setBusy(false)
    }
  }
  return (
    <main className="workspace studio-page management-page">
      <PageHeader
        kicker="ACCOUNT"
        title="个人设置"
        actions={
          <button disabled={pending} onClick={() => void refresh()}>
            刷新
          </button>
        }
      />
      <div className="management-scroll personal-settings">
        <nav className="reading-tabs" aria-label="个人设置页签">
          {(
            [
              ['avatar', '头像'],
              ['username', '用户名'],
              ['password', '密码'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-current={tab === key ? 'page' : undefined}
              className={tab === key ? 'active' : ''}
              disabled={pending}
              onClick={() => selectTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'password' ? (
          <ChangePassword
            key={generation}
            embedded
            onDirtyChange={setPasswordDirty}
            onBusyChange={setPasswordBusy}
            onComplete={() => p.onSessionEnd('密码已修改，请使用新密码重新登录。')}
            onCancel={reset}
          />
        ) : (
          <form className="dashboard-card password-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              {tab === 'avatar' ? (
                <>
                  <h2>头像</h2>
                  <div className="profile-avatar-preview">
                    {(preview || settings?.avatarUrl) && !failed ? (
                      <img
                        alt="头像预览"
                        src={preview || settings?.avatarUrl || ''}
                        onError={() => setFailed(true)}
                      />
                    ) : (
                      <Icon name="user" size={48} />
                    )}
                  </div>
                  <label>
                    选择头像
                    <input
                      ref={input}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) => {
                        const next = e.target.files?.[0]
                        setNotice('')
                        if (!next) return
                        if (
                          !['image/png', 'image/jpeg'].includes(next.type) ||
                          next.size > 2 * 1024 * 1024
                        ) {
                          setNotice('请选择不超过 2 MiB 的 PNG 或 JPEG 图片。')
                          e.target.value = ''
                          return
                        }
                        setFile(next)
                      }}
                    />
                  </label>
                  <p className="settings-help">
                    PNG 或 JPEG，最大 2 MiB。保存后同步更新管理台和公开站头像。
                  </p>
                </>
              ) : (
                <>
                  <h2>修改登录用户名</h2>
                  <label>
                    用户名
                    <input
                      autoComplete="username"
                      required
                      maxLength={100}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                  <label>
                    当前密码
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={72}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <p className="settings-help">修改后所有设备需使用新用户名重新登录。</p>
                </>
              )}
            </fieldset>
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            <div className="actions">
              <button type="button" disabled={busy} onClick={reset}>
                取消
              </button>
              <button
                className="primary"
                type="submit"
                disabled={
                  busy ||
                  (tab === 'avatar' ? !file || !settings || failed : username === p.username)
                }
              >
                {busy ? '正在保存…' : tab === 'avatar' ? '保存头像' : '修改用户名并退出'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
