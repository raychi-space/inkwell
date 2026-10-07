import { api, apiResponse } from '../../shared/api/client'
import type { Provider, Assistant, Turn, TurnRequest } from './types'
const base = '/api/v1/admin/ai'
export const providers = () => api<{ items: Provider[] }>(base + '/providers').then((v) => v.items)
export const assistants = () =>
  api<{ items: Assistant[] }>(base + '/assistants').then((v) => v.items)
export const saveProvider = (id: string | null, body: unknown) =>
  api<Provider>(base + '/providers' + (id ? '/' + id : ''), {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
export const saveAssistant = (id: string | null, body: unknown) =>
  api<Assistant>(base + '/assistants' + (id ? '/' + id : ''), {
    method: id ? 'PATCH' : 'POST',
    body: JSON.stringify(body),
  })
export const testProvider = (id: string, model: string) =>
  api<{
    connection: { ok: boolean; reply?: string; error?: string }
    tools: { ok: boolean; error?: string }
    durationMs: number
  }>(base + '/providers/' + id + '/test', {
    method: 'POST',
    body: JSON.stringify({ model }),
  })
export const createTurn = (body: TurnRequest, signal?: AbortSignal) =>
  api<Turn>(base + '/turns', { method: 'POST', body: JSON.stringify(body), signal })
export const getTurn = (id: string, signal?: AbortSignal) =>
  api<Turn>(base + '/turns/' + id, { signal })

export async function streamTurn(
  id: string,
  onUpdate: (turn: Turn) => void,
  signal: AbortSignal,
): Promise<Turn> {
  const response = await apiResponse(base + '/turns/' + encodeURIComponent(id) + '/events', {
    signal,
    headers: { Accept: 'text/event-stream' },
  })
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new Error('服务未返回流式响应。')
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let buffer = '',
    terminal: Turn | undefined
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.length > 1_048_576) throw new Error('流式响应超过限制。')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const lines = event.split('\n'),
          name = lines
            .find((line) => line.startsWith('event:'))
            ?.slice(6)
            .trim()
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (name === 'stream-error') throw new Error('连接中断，请重试。')
        if (name !== 'turn' || !data) continue
        const turn = JSON.parse(data) as Turn
        if (
          turn.turnId !== id ||
          !['pending', 'running', 'succeeded', 'failed'].includes(turn.status)
        )
          throw new Error('流式响应格式错误。')
        onUpdate(turn)
        if (turn.status === 'succeeded' || turn.status === 'failed') terminal = turn
      }
      if (terminal) return terminal
      if (done) break
    }
    throw new Error('流式连接提前结束，请重试。')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
