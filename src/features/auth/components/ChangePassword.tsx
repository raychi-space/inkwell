import { useRef, useState, type FormEvent } from 'react'
import { changePassword } from '../api'
import { passwordValidation } from '../passwordValidation'
import { errorMessage } from '../../../shared/lib/errors'

export function ChangePassword({
  onComplete,
  onCancel,
}: {
  onComplete: () => void
  onCancel: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    const validation = passwordValidation(currentPassword, newPassword, confirmation)
    if (validation) {
      setNotice(validation)
      return
    }
    submitting.current = true
    setBusy(true)
    setNotice('')
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      onComplete()
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <main className="workspace studio-page">
      <header className="studio-head">
        <div>
          <p className="eyebrow">账户安全</p>
          <h1>修改密码</h1>
        </div>
      </header>
      <form className="dashboard-card password-form" onSubmit={submit}>
        <p className="settings-help">修改成功后，所有设备的登录都会失效，请使用新密码重新登录。</p>
        <fieldset disabled={busy}>
          <label>
            当前密码
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={72}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              autoComplete="new-password"
              required
              maxLength={72}
              aria-describedby="password-rules"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <p id="password-rules" className="settings-help">
            至少 12 个字符；最多 72 个 UTF-8 字节，中文等字符会占用多个字节。
          </p>
          <label>
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              required
              maxLength={72}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
        </fieldset>
        {notice && (
          <p role="alert" className="notice">
            {notice}
          </p>
        )}
        <div className="actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button className="primary" disabled={busy} type="submit">
            {busy ? '正在修改…' : '修改密码并退出'}
          </button>
        </div>
      </form>
    </main>
  )
}
