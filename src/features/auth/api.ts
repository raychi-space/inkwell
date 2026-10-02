import { api, resetAuthSession, refreshCsrf } from '../../shared/api/client'
import type { Session } from './types'

export async function getSession(): Promise<Session> {
  return api('/api/v1/auth/session')
}

export async function login(username: string, password: string) {
  const result = await api<Session>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  resetAuthSession()
  await refreshCsrf()
  return result
}

export async function logout() {
  await api<void>('/api/v1/auth/logout', { method: 'POST' })
  resetAuthSession()
}
