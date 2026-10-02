import type { FormEvent } from 'react'

type Props = {
  username: string
  password: string
  busy: boolean
  notice: string
  onUsername: (value: string) => void
  onPassword: (value: string) => void
  onSubmit: (event: FormEvent) => void
}

export function LoginScreen({
  username,
  password,
  busy,
  notice,
  onUsername,
  onPassword,
  onSubmit,
}: Props) {
  return (
    <main className="login-screen">
      <div className="login-card">
        <p className="eyebrow">RAYCHI · CONTENT STUDIO</p>
        <h1>墨池</h1>
        <p className="muted">在这里写下文章，再决定何时让它被看见。</p>
        <form onSubmit={onSubmit}>
          <label>
            站长账号
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => onUsername(e.target.value)}
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            登录
          </button>
        </form>
        {notice && (
          <p className="notice error" role="alert">
            {notice}
          </p>
        )}
      </div>
    </main>
  )
}
