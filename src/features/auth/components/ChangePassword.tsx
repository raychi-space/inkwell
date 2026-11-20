import { Button } from '../../../shared/ui/Button'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { changePassword } from '../api'
import { passwordValidation } from '../passwordValidation'
import { errorMessage } from '../../../shared/lib/errors'
import { Input } from '../../../shared/ui/Input'
import { PageHeader } from '../../../shared/ui/PageHeader'

export function ChangePassword({
  onComplete,
  onCancel,
  embedded = false,
  disabled = false,
  beforeSubmit,
  onDirtyChange,
  onBusyChange,
}: {
  onComplete: () => void
  onCancel: () => void
  embedded?: boolean
  disabled?: boolean
  beforeSubmit?: () => boolean
  onDirtyChange?: (value: boolean) => void
  onBusyChange?: (value: boolean) => void
}) {
  const [newPasswordEdited, setNewPasswordEdited] = useState(false)
  const [confirmationEdited, setConfirmationEdited] = useState(false)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  useEffect(() => {
    onDirtyChange?.(newPasswordEdited || confirmationEdited)
    return () => onDirtyChange?.(false)
  }, [newPasswordEdited, confirmationEdited, onDirtyChange])
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || disabled) return
    const data = new FormData(event.currentTarget)
    const currentPassword = String(data.get('currentPassword') ?? '')
    const newPassword = String(data.get('newPassword') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')
    // Verification input, including autofill of the old password, is not a password change.
    setNewPasswordEdited(Boolean(newPassword))
    setConfirmationEdited(Boolean(confirmation))
    const validation = passwordValidation(currentPassword, newPassword, confirmation)
    if (validation) {
      setNotice(validation)
      return
    }
    if (beforeSubmit && !beforeSubmit()) return
    submitting.current = true
    setBusy(true)
    setNotice('')
    try {
      await changePassword(currentPassword, newPassword)
      setNewPasswordEdited(false)
      setConfirmationEdited(false)
      onComplete()
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const Container = embedded ? 'section' : 'main'
  return (
    <Container className={embedded ? '' : 'workspace studio-page'}>
      {!embedded && <PageHeader kicker="账户安全" title="修改密码" />}
      <form className="dashboard-card password-form" aria-label="密码设置" onSubmit={submit}>
        {embedded && <h2>修改密码</h2>}
        <p className="settings-help">修改成功后，所有设备的登录都会失效，请使用新密码重新登录。</p>
        <fieldset disabled={busy || disabled}>
          <label>
            当前密码
            <Input
              type="password"
              autoComplete="current-password"
              required
              maxLength={72}
              name="currentPassword"
            />
          </label>
          <label>
            新密码
            <Input
              type="password"
              autoComplete="new-password"
              required
              maxLength={72}
              aria-describedby="password-rules"
              name="newPassword"
              onChange={({ currentTarget: input }) =>
                setNewPasswordEdited(Boolean(input.value) && !input.matches(':autofill'))
              }
            />
          </label>
          <p id="password-rules" className="settings-help">
            至少 12 个字符；最多 72 个 UTF-8 字节，中文等字符会占用多个字节。
          </p>
          <label>
            确认新密码
            <Input
              type="password"
              autoComplete="new-password"
              required
              maxLength={72}
              name="confirmation"
              onChange={({ currentTarget: input }) =>
                setConfirmationEdited(Boolean(input.value) && !input.matches(':autofill'))
              }
            />
          </label>
        </fieldset>
        {notice && (
          <p role="alert" className="notice">
            {notice}
          </p>
        )}
        <div className="actions">
          <Button variant="secondary" type="button" disabled={busy || disabled} onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" className="primary" disabled={busy || disabled} type="submit">
            {busy ? '正在修改…' : '修改密码并退出'}
          </Button>
        </div>
      </form>
    </Container>
  )
}
