import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { getSession, login } from '../api'
import type { Session } from '../types'
import { LoginScreen } from './LoginScreen'
import { onSessionExpired, resetAuthSession } from '../../../shared/api/client'
import { errorMessage } from '../../../shared/lib/errors'

export function SessionBoundary({ children }: {
  children: (session: Session, onSessionEnd: () => void, checkSession: () => Promise<boolean>) => ReactNode
}) {
  const [session, setSession] = useState<Session | null>(null)
  const [username, setUsername] = useState(''), [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const sessionRef = useRef(session), revision = useRef(0), mounted = useRef(false)
  const checking = useRef<Promise<boolean> | null>(null)
  sessionRef.current = session

  const endSession = useCallback((expired = false) => {
    revision.current++
    resetAuthSession()
    sessionRef.current = { authenticated: false, username: null }
    setSession(sessionRef.current)
    setPassword('')
    setBusy(false)
    setNotice(expired ? '登录已失效，请重新登录。' : '')
  }, [])

  const checkSession = useCallback((): Promise<boolean> => {
    if (checking.current) return checking.current
    const version = revision.current
    const work = (async () => {
      try {
        const value = await getSession()
        if (!mounted.current || version !== revision.current) return false
        if (!value.authenticated) endSession(!!sessionRef.current?.authenticated)
        else { sessionRef.current = value; setSession(value) }
        return value.authenticated
      } catch (error) {
        if (mounted.current && version === revision.current) {
          setNotice(errorMessage(error))
          if (!sessionRef.current) setSession({ authenticated: false, username: null })
        }
        return false
      }
    })()
    checking.current = work
    void work.finally(() => { if (checking.current === work) checking.current = null })
    return work
  }, [endSession])

  useEffect(() => {
    mounted.current = true
    const unsubscribe = onSessionExpired(() => { if (mounted.current) endSession(true) })
    void checkSession()
    const recheck = () => { if (sessionRef.current?.authenticated && document.visibilityState === 'visible') void checkSession() }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      mounted.current = false
      revision.current++
      unsubscribe()
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
      checking.current = null
    }
  }, [checkSession, endSession])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    const version = ++revision.current
    setBusy(true)
    try {
      const value = await login(username, password)
      if (!mounted.current || version !== revision.current) return
      sessionRef.current = value
      setSession(value)
      setPassword('')
      setNotice('')
    } catch (error) { if (mounted.current && version === revision.current) setNotice(errorMessage(error)) }
    finally { if (mounted.current && version === revision.current) setBusy(false) }
  }

  if (session === null) return <main className="login-screen"><p role="status">正在检查登录状态…</p></main>
  if (!session.authenticated) return <LoginScreen username={username} password={password} busy={busy} notice={notice}
    onUsername={setUsername} onPassword={setPassword} onSubmit={signIn} />
  // Unmounting this subtree also discards cached protected data and pending editor state.
  return children(session, endSession, checkSession)
}
