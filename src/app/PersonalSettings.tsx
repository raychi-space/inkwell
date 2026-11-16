import { Button } from '../shared/ui/Button'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChangePassword, changeUsername } from '../features/auth'
import { getSettings, type SiteSettings } from '../features/settings'
import { saveAvatar } from '../features/settings/api'
import { PageHeader } from '../shared/ui/PageHeader'
import { Input } from '../shared/ui/Input'
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
  const [settings, setSettings] = useState(p.initialValue)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [failed, setFailed] = useState(false)
  const [username, setUsername] = useState(p.username)
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [avatarNotice, setAvatarNotice] = useState('')
  const [usernameNotice, setUsernameNotice] = useState('')
  const [busy, setBusy] = useState<'avatar' | 'username' | 'refresh' | null>(null)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const settingsGeneration = useRef(0)
  const usernameDirty = username !== p.username || !!password
  const dirty = !!file || usernameDirty || passwordDirty
  const pending = busy !== null || passwordBusy
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
  function resetAvatar() {
    setFile(null)
    setAvatarNotice('')
    if (input.current) input.current.value = ''
  }
  function resetUsername() {
    setUsername(p.username)
    setPassword('')
    setUsernameNotice('')
  }
  async function submit(event: FormEvent, section: 'avatar' | 'username') {
    event.preventDefault()
    if (submitting.current || pending) return
    if (section === 'avatar' && (!file || !settings || failed)) return
    if (
      section === 'username' &&
      (file || passwordDirty) &&
      !window.confirm('修改用户名将退出登录，其他未保存修改会丢失，确定继续吗？')
    )
      return
    submitting.current = true
    setBusy(section)
    const setSectionNotice = section === 'avatar' ? setAvatarNotice : setUsernameNotice
    setSectionNotice('')
    try {
      if (section === 'avatar' && file && settings) {
        settingsGeneration.current++
        const saved = await saveAvatar(file, settings.version)
        setSettings(saved)
        p.onSaved(saved)
        resetAvatar()
        setAvatarNotice('头像已保存。')
      } else if (section === 'username') {
        await changeUsername(password, username)
        setPassword('')
        p.onSessionEnd('用户名已修改，请使用新用户名重新登录。')
      }
    } catch (e) {
      setSectionNotice(errorMessage(e))
    } finally {
      submitting.current = false
      setBusy(null)
    }
  }
  async function refresh() {
    if (pending || (dirty && !window.confirm('当前修改尚未保存，确定放弃并刷新吗？'))) return
    resetAvatar()
    resetUsername()
    setGeneration((v) => v + 1)
    setNotice('')
    const request = ++settingsGeneration.current
    setBusy('refresh')
    try {
      const value = await getSettings(true)
      if (request === settingsGeneration.current) {
        setSettings(value)
        p.onSaved(value)
      }
    } catch (e) {
      if (request === settingsGeneration.current) setNotice(errorMessage(e))
    } finally {
      if (request === settingsGeneration.current) setBusy(null)
    }
  }
  return (
    <main className="workspace studio-page management-page">
      <PageHeader
        kicker="ACCOUNT"
        title="个人设置"
        actions={
          <Button variant="secondary" disabled={pending} onClick={() => void refresh()}>
            刷新
          </Button>
        }
      />
      <div className="management-scroll personal-settings">
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <form
          className="dashboard-card password-form"
          aria-label="头像设置"
          onSubmit={(e) => void submit(e, 'avatar')}
        >
          <fieldset disabled={pending}>
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
              <Input
                ref={input}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const next = e.target.files?.[0]
                  setAvatarNotice('')
                  if (!next) return
                  if (
                    !['image/png', 'image/jpeg'].includes(next.type) ||
                    next.size > 5 * 1024 * 1024
                  ) {
                    setAvatarNotice('请选择不超过 5 MiB 的 PNG 或 JPEG 图片。')
                    e.target.value = ''
                    return
                  }
                  setFile(next)
                }}
              />
            </label>
            <p className="settings-help">
              PNG 或 JPEG，最大 5 MiB。保存后同步更新管理台和公开站头像。
            </p>
          </fieldset>
          {avatarNotice && (
            <p role="status" className="notice">
              {avatarNotice}
            </p>
          )}
          <div className="actions">
            <Button variant="secondary" type="button" disabled={pending} onClick={resetAvatar}>
              取消
            </Button>
            <Button
              variant="primary"
              className="primary"
              type="submit"
              disabled={pending || !file || !settings || failed}
            >
              {busy === 'avatar' ? '正在保存…' : '保存头像'}
            </Button>
          </div>
        </form>
        <form
          className="dashboard-card password-form"
          aria-label="用户名设置"
          onSubmit={(e) => void submit(e, 'username')}
        >
          <fieldset disabled={pending}>
            <h2>修改登录用户名</h2>
            <label>
              用户名
              <Input
                autoComplete="username"
                required
                maxLength={100}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              当前密码
              <Input
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <p className="settings-help">修改后所有设备需使用新用户名重新登录。</p>
          </fieldset>
          {usernameNotice && (
            <p role="status" className="notice">
              {usernameNotice}
            </p>
          )}
          <div className="actions">
            <Button variant="secondary" type="button" disabled={pending} onClick={resetUsername}>
              取消
            </Button>
            <Button
              variant="primary"
              className="primary"
              type="submit"
              disabled={pending || username === p.username}
            >
              {busy === 'username' ? '正在保存…' : '修改用户名并退出'}
            </Button>
          </div>
        </form>
        <ChangePassword
          key={generation}
          embedded
          disabled={busy !== null}
          onDirtyChange={setPasswordDirty}
          onBusyChange={setPasswordBusy}
          beforeSubmit={() =>
            (!file && !usernameDirty) ||
            window.confirm('修改密码将退出登录，其他未保存修改会丢失，确定继续吗？')
          }
          onComplete={() => p.onSessionEnd('密码已修改，请使用新密码重新登录。')}
          onCancel={() => setGeneration((v) => v + 1)}
        />
      </div>
    </main>
  )
}
