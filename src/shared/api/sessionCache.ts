/** Private read results live only in this browser session, never in persistent storage. */
type Entry = { value: unknown; expiresAt: number; bytes: number }
const entries = new Map<string, Entry>()
const pending = new Map<string, Promise<unknown>>()
const viewState = new Map<string, unknown>()
const maxEntries = 80
const maxBytes = 8 * 1024 * 1024
const maxEntryBytes = 2 * 1024 * 1024
let bytes = 0
let session = 0

export function invalidateReadCache() {
  entries.clear()
  pending.clear()
  bytes = 0
}

export function clearSessionCache() {
  session++
  invalidateReadCache()
  viewState.clear()
}

export function peekRead<T>(key: string): T | undefined {
  const entry = entries.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key)
    bytes -= entry.bytes
    return undefined
  }
  entries.delete(key)
  entries.set(key, entry)
  return structuredClone(entry.value) as T
}

function store(key: string, value: unknown, ttl: number) {
  const size = new TextEncoder().encode(JSON.stringify(value)).byteLength
  if (size > maxEntryBytes) return
  const old = entries.get(key)
  if (old) bytes -= old.bytes
  entries.delete(key)
  entries.set(key, { value: structuredClone(value), expiresAt: Date.now() + ttl, bytes: size })
  bytes += size
  while (entries.size > maxEntries || bytes > maxBytes) {
    const first = entries.keys().next().value!
    bytes -= entries.get(first)!.bytes
    entries.delete(first)
  }
}

export type ReadOptions = { signal?: AbortSignal; force?: boolean; ttl?: number }
export function readQuery<T>(
  key: string,
  loader: () => Promise<T>,
  options: ReadOptions = {},
): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  const callerSession = session
  let work: Promise<T>
  const hit = options.force ? undefined : peekRead<T>(key)
  if (hit !== undefined) work = Promise.resolve(hit)
  else if (!options.force && pending.has(key)) work = pending.get(key)! as Promise<T>
  else {
    const version = session
    work = loader()
      .then((value) => {
        if (version !== session) throw new DOMException('Session changed', 'AbortError')
        // A write, forced refresh or logout may have superseded this request.
        if (pending.get(key) === work) store(key, value, options.ttl ?? 60_000)
        return value
      })
      .finally(() => {
        if (pending.get(key) === work) pending.delete(key)
      })
    // Bound in-flight bookkeeping as well as resolved data.
    if (pending.size >= maxEntries) pending.delete(pending.keys().next().value!)
    pending.set(key, work)
  }
  const current = work.then((value) => {
    if (callerSession !== session) throw new DOMException('Session changed', 'AbortError')
    return structuredClone(value)
  })
  if (!options.signal) return current
  const signal = options.signal
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    current.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function readViewState<T>(key: string, initial: T | (() => T)): T {
  return viewState.has(key)
    ? (viewState.get(key) as T)
    : typeof initial === 'function'
      ? (initial as () => T)()
      : initial
}
export function writeViewState<T>(key: string, value: T) {
  if (viewState.size >= 80 && !viewState.has(key)) viewState.delete(viewState.keys().next().value!)
  viewState.set(key, value)
}
