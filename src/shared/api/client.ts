let csrfToken: string | null = null
let csrfHeader = 'X-CSRF-TOKEN'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export async function refreshCsrf() {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new ApiError(response.status, 'CSRF_UNAVAILABLE', '无法初始化安全会话。')
  const data = await response.json() as { token: string; headerName: string }
  csrfToken = data.token
  csrfHeader = data.headerName
}

export function resetCsrf() { csrfToken = null }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD' && !csrfToken) await refreshCsrf()
  const headers = new Headers(options.headers)
  if (method !== 'GET' && method !== 'HEAD') headers.set(csrfHeader, csrfToken!)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { code?: string; message?: string } | null
    if (response.status === 403 && data?.code === 'CSRF_INVALID') resetCsrf()
    throw new ApiError(response.status, data?.code ?? 'REQUEST_FAILED', data?.message ?? `请求失败（${response.status}）。`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
