import { useEffect, useState, useRef, type FormEvent } from 'react'
import { ChangePassword, changeUsername, saveNickname, type Session } from '../features/auth'
import { getSettings, type SiteSettings } from '../features/settings'
import { saveAvatar } from '../features/settings/api'
import { Button } from '../shared/ui/Button'
import { PageHeader } from '../shared/ui/PageHeader'
import { Input } from '../shared/ui/Input'
import { Icon } from '../shared/ui/Icon'
import { errorMessage } from '../shared/lib/errors'

type Props = {
  username: string
  nickname: string
  initialValue: SiteSettings | null
  onSaved: (value: SiteSettings) => void
  onNicknameSaved: (value: Session) => void
  onSessionEnd: (notice: string) => void
  onRefreshSession: () => Promise<boolean>
  onDirtyChange: (value: boolean) => void
  onBusyChange: (value: boolean) => void
}

export function PersonalSettings(p: Props) {
  const [settings, setSettings] = useState(p.initialValue)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [failed, setFailed] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState<{ initial: string; value: string } | null>(
    null,
  )
  const [username, setUsername] = useState<string | null>(null)
  const [editingPassword, setEditingPassword] = useState(false)
  const [notice, setNotice] = useState('')
  const [avatarNotice, setAvatarNotice] = useState('')
  const [nicknameNotice, setNicknameNotice] = useState('')
  const [usernameNotice, setUsernameNotice] = useState('')
  const [busy, setBusy] = useState<'avatar' | 'nickname' | 'username' | 'refresh' | null>(null)
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const submitting = useRef(false)
  const settingsGeneration = useRef(0)
  const nicknameDirty =
    nicknameDraft !== null && nicknameDraft.value.trim() !== nicknameDraft.initial
  const usernameDirty = username !== null && username !== p.username
  const dirty = Boolean(file) || nicknameDirty || usernameDirty || passwordDirty
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

  function closeAvatar() {
    setEditingAvatar(false)
    setFile(null)
    setAvatarNotice('')
  }
  function closeNickname() {
    setNicknameDraft(null)
    setNicknameNotice('')
  }
  function closeUsername() {
    setUsername(null)
    setUsernameNotice('')
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    section: 'avatar' | 'nickname' | 'username',
  ) {
    event.preventDefault()
    if (submitting.current || pending) return
    if (section === 'avatar' && (!file || !settings || failed)) return
    if (section === 'nickname' && (!nicknameDirty || !nicknameDraft?.value.trim())) return
    if (
      section === 'username' &&
      (!usernameDirty ||
        ((file || nicknameDirty || passwordDirty) &&
          !window.confirm('修改用户名将退出登录，其他未保存修改会丢失，确定继续吗？')))
    )
      return

    const currentPassword =
      section === 'username'
        ? String(new FormData(event.currentTarget).get('currentPassword') ?? '')
        : ''
    submitting.current = true
    setBusy(section)
    const setSectionNotice = {
      avatar: setAvatarNotice,
      nickname: setNicknameNotice,
      username: setUsernameNotice,
    }[section]
    setSectionNotice('')
    try {
      if (section === 'avatar' && file && settings) {
        settingsGeneration.current++
        const saved = await saveAvatar(file, settings.version)
        setSettings(saved)
        p.onSaved(saved)
        closeAvatar()
        setAvatarNotice('头像已保存。')
      } else if (section === 'nickname' && nicknameDraft) {
        const saved = await saveNickname(nicknameDraft.value)
        p.onNicknameSaved(saved)
        closeNickname()
        setNicknameNotice('昵称已保存。')
      } else if (section === 'username' && username !== null) {
        await changeUsername(currentPassword, username)
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
    closeAvatar()
    closeNickname()
    closeUsername()
    setEditingPassword(false)
    setNotice('')
    const request = ++settingsGeneration.current
    setBusy('refresh')
    try {
      const [value] = await Promise.all([getSettings(true), p.onRefreshSession()])
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
          <div className="profile-setting-heading">
            <h2>头像</h2>
            {!editingAvatar && (
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setAvatarNotice('')
                  setEditingAvatar(true)
                }}
              >
                编辑头像
              </Button>
            )}
          </div>
          <div className="profile-avatar-preview">
            {(preview || settings?.avatarUrl) && !failed ? (
              <img
                alt={file ? '头像预览' : '当前头像'}
                src={preview || settings?.avatarUrl || ''}
                onError={() => setFailed(true)}
              />
            ) : (
              <Icon name="user" size={48} />
            )}
          </div>
          {editingAvatar && (
            <>
              <fieldset disabled={pending}>
                <label>
                  选择头像
                  <Input
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
                <p className="settings-help">PNG 或 JPEG，最大 5 MiB。</p>
              </fieldset>
              <div className="actions">
                <Button type="button" disabled={pending} onClick={closeAvatar}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={pending || !file || !settings || failed}
                >
                  {busy === 'avatar' ? '正在保存…' : '保存头像'}
                </Button>
              </div>
            </>
          )}
          {avatarNotice && (
            <p role="status" className="notice">
              {avatarNotice}
            </p>
          )}
        </form>
        <form
          className="dashboard-card password-form"
          aria-label="昵称设置"
          onSubmit={(e) => void submit(e, 'nickname')}
        >
          <div className="profile-setting-heading">
            <h2>昵称</h2>
            {!nicknameDraft && (
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setNicknameNotice('')
                  setNicknameDraft({ initial: p.nickname, value: p.nickname })
                }}
              >
                编辑昵称
              </Button>
            )}
          </div>
          {nicknameDraft ? (
            <>
              <fieldset disabled={pending}>
                <label>
                  昵称
                  <Input
                    autoComplete="off"
                    required
                    maxLength={100}
                    value={nicknameDraft.value}
                    onChange={(e) => setNicknameDraft({ ...nicknameDraft, value: e.target.value })}
                  />
                </label>
              </fieldset>
              <div className="actions">
                <Button type="button" disabled={pending} onClick={closeNickname}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={pending || !nicknameDirty || !nicknameDraft.value.trim()}
                >
                  {busy === 'nickname' ? '正在保存…' : '保存昵称'}
                </Button>
              </div>
            </>
          ) : (
            <p className="profile-nickname">{p.nickname}</p>
          )}
          {nicknameNotice && (
            <p role="status" className="notice">
              {nicknameNotice}
            </p>
          )}
        </form>
        {editingPassword ? (
          <ChangePassword
            embedded
            disabled={busy !== null}
            onDirtyChange={setPasswordDirty}
            onBusyChange={setPasswordBusy}
            beforeSubmit={() =>
              (!file && !nicknameDirty && !usernameDirty) ||
              window.confirm('修改密码将退出登录，其他未保存修改会丢失，确定继续吗？')
            }
            onComplete={() => p.onSessionEnd('密码已修改，请使用新密码重新登录。')}
            onCancel={() => setEditingPassword(false)}
          />
        ) : (
          <section className="dashboard-card password-form" aria-label="密码设置">
            <div className="profile-setting-heading">
              <h2>密码</h2>
              <Button disabled={pending} onClick={() => setEditingPassword(true)}>
                编辑密码
              </Button>
            </div>
          </section>
        )}
        {username === null ? (
          <div>
            <Button disabled={pending} onClick={() => setUsername(p.username)}>
              修改登录用户名
            </Button>
          </div>
        ) : (
          <form
            className="dashboard-card password-form"
            aria-label="用户名设置"
            onSubmit={(e) => void submit(e, 'username')}
          >
            <h2>修改登录用户名</h2>
            <fieldset disabled={pending}>
              <label>
                用户名
                <Input
                  autoComplete="username"
                  required
                  maxLength={100}
                  value={username}
                  onChange={(e) => {
                    if (!e.currentTarget.matches(':autofill')) setUsername(e.currentTarget.value)
                  }}
                />
              </label>
              <label>
                当前密码
                <Input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={72}
                />
              </label>
              <p className="settings-help">修改后所有设备需使用新用户名重新登录。</p>
            </fieldset>
            {usernameNotice && (
              <p role="alert" className="notice">
                {usernameNotice}
              </p>
            )}
            <div className="actions">
              <Button type="button" disabled={pending} onClick={closeUsername}>
                取消
              </Button>
              <Button variant="primary" type="submit" disabled={pending || !usernameDirty}>
                {busy === 'username' ? '正在保存…' : '修改用户名并退出'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
