export type Article = {
  id: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED'
  version: number
  title: string
  summary: string
  bodyMarkdown: string
  tags: string[]
  coverUrl: string | null
  hasUnpublishedChanges: boolean
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  publicUpdatedAt: string | null
}

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type Session = { authenticated: boolean; username: string | null }
export type Uploaded = {
  id: string
  articleId: string
  url: string
  previewUrl: string
  mediaType: string
  byteSize: number
  width: number
  height: number
}

let csrfToken: string | null = null
let csrfHeader = 'X-CSRF-TOKEN'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

async function csrf() {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new ApiError(response.status, 'CSRF_UNAVAILABLE', '无法初始化安全会话。')
  const data = await response.json() as { token: string; headerName: string }
  csrfToken = data.token
  csrfHeader = data.headerName
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD' && !csrfToken) await csrf()
  const headers = new Headers(options.headers)
  if (method !== 'GET' && method !== 'HEAD') headers.set(csrfHeader, csrfToken!)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { code?: string; message?: string } | null
    if (response.status === 403 && data?.code === 'CSRF_INVALID') csrfToken = null
    throw new ApiError(response.status, data?.code ?? 'REQUEST_FAILED', data?.message ?? `请求失败（${response.status}）。`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export async function login(username: string, password: string) {
  const result = await api<Session>('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  })
  csrfToken = null
  await csrf()
  return result
}

export async function logout() {
  await api<void>('/api/v1/auth/logout', { method: 'POST' })
  csrfToken = null
}

export async function upload(articleId: string, file: File): Promise<Uploaded> {
  const body = new FormData()
  body.append('file', file)
  return api<Uploaded>(`/api/v1/admin/articles/${articleId}/assets`, { method: 'POST', body })
}
