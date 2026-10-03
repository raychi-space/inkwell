let csrfToken: string | null = null
let csrfHeader = 'X-CSRF-TOKEN'
let sessionVersion = 0
let protectedRequests = new AbortController()
const sessionExpiredListeners = new Set<() => void>()

export function onSessionExpired(listener: () => void) {
  sessionExpiredListeners.add(listener)
  return () => {
    sessionExpiredListeners.delete(listener)
  }
}

export function resetAuthSession() {
  sessionVersion++
  csrfToken = null
  protectedRequests.abort()
  protectedRequests = new AbortController()
}

function expireSession(version: number) {
  if (version !== sessionVersion) return
  resetAuthSession()
  sessionExpiredListeners.forEach((listener) => listener())
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function refreshCsrf() {
  const version = sessionVersion
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) throw new ApiError(response.status, 'CSRF_UNAVAILABLE', '无法初始化安全会话。')
  const data = (await response.json()) as { token: string; headerName: string }
  if (version !== sessionVersion) throw new ApiError(401, 'AUTH_REQUIRED', '登录状态已改变。')
  csrfToken = data.token
  csrfHeader = data.headerName
}

export function resetCsrf() {
  csrfToken = null
}

export async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const version = sessionVersion
  const protectedPath = path.startsWith('/api/v1/admin/') || path === '/api/v1/auth/logout'
  const signal = protectedPath
    ? options.signal
      ? AbortSignal.any([options.signal, protectedRequests.signal])
      : protectedRequests.signal
    : options.signal
  const method = options.method?.toUpperCase() ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD' && !csrfToken) await refreshCsrf()
  if (protectedPath && version !== sessionVersion)
    throw new ApiError(401, 'AUTH_REQUIRED', '登录状态已改变。')
  const headers = new Headers(options.headers)
  if (method !== 'GET' && method !== 'HEAD') headers.set(csrfHeader, csrfToken!)
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json')
  const response = await fetch(path, {
    ...options,
    signal,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      code?: string
      message?: string
    } | null
    if (protectedPath && response.status === 401 && data?.code === 'AUTH_REQUIRED')
      expireSession(version)
    if (response.status === 403 && data?.code === 'CSRF_INVALID') {
      resetCsrf()
      if (protectedPath) {
        // An expired session can fail CSRF before reaching the authentication filter.
        // Check it explicitly; a valid session with a bad token must stay signed in.
        try {
          const session = await fetch('/api/v1/auth/session', {
            credentials: 'same-origin',
            cache: 'no-store',
            signal,
          })
          if (session.ok && (await session.json()).authenticated === false) expireSession(version)
        } catch {
          /* Network failures do not prove that a session expired. */
        }
      }
    }
    throw new ApiError(
      response.status,
      data?.code ?? 'REQUEST_FAILED',
      data?.message ?? `请求失败（${response.status}）。`,
    )
  }
  return response
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
