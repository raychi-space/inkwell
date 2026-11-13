import { api } from './client.js'
import { readQuery, type ReadOptions } from './sessionCache.js'

/** Opt-in JSON GETs only. Auth, tasks, streams, downloads and writes use api directly. */
export function readApi<T>(path: string, options: ReadOptions = {}): Promise<T> {
  // Each caller may stop waiting without cancelling another subscriber's shared request.
  // client.ts still cancels the underlying request when the authenticated session ends.
  return readQuery(path, () => api<T>(path), options)
}
