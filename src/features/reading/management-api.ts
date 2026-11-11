import { api } from '../../shared/api/client'

export type ReadingUsage = {
  calls: number
  ok: number
  failed: number
  unknown: number
  p50Ms: number | null
  p95Ms: number | null
  tokensIn: number
  tokensOut: number
}
export type ReadingBudget = {
  service: string
  perMinute: number
  perHour: number
  perDay: number
  usedMinute: number
  usedHour: number
  usedDay: number
  updatedAt: string | null
}
export type ReadingTask = {
  id: string
  kind: string
  name: string
  status: string
  startedAt: string
  finishedAt: string | null
  error: string | null
}
export type ReadingDashboard = {
  checkedAt: string
  timeZone: string
  processes: Record<'api' | 'worker', { status: string; lastSeenAt: string | null }>
  sources: { total: number; enabled: number; healthy: number; failing: number; degraded: number }
  counts: { collectedToday: number; pending: number; published: number }
  trend: { date: string; collected: number; processed: number }[]
  tasks: { page: number; pageSize: number; total: number; items: ReadingTask[] }
  modelSummary: ReadingUsage
  budgets: ReadingBudget[]
}
export type AihotSource = {
  id: string
  name: string
  enabled: boolean
  health: string
  intervalMinutes: number
  lastSuccessAt: string | null
  lastFetchAt: string | null
  nextFetchAt: string | null
  lastError: string | null
}
export type AihotSourceDetail = AihotSource & { feedUrl: string; version: string }
export type AihotSourcePage = {
  page: number
  pageSize: number
  total: number
  items: AihotSource[]
}
export type SourceDraft = { name: string; feedUrl: string; intervalMinutes: number }
export type ReadingModels = {
  checkedAt: string
  metadataAvailable: boolean
  metadataAt: string | null
  days: number
  choices: { key: string; label: string; service: string; vision: boolean }[]
  capabilities: {
    key: string
    label: string
    currentKey: string
    currentLabel: string
    configured: boolean
    usage: ReadingUsage
  }[]
  budgets: ReadingBudget[]
  summary: ReadingUsage
}
const base = '/api/v1/admin/reading/aihot'
const query = (values: Record<string, string | number>) =>
  '?' +
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => [k, String(v)]),
  )
export const readingDashboard = (values: Record<string, string | number>) =>
  api<ReadingDashboard>(base + '/dashboard' + query(values))
export const aihotSources = (values: Record<string, string | number>) =>
  api<AihotSourcePage>(base + '/sources' + query(values))
export const aihotSource = (id: string) =>
  api<AihotSourceDetail>(base + '/sources/' + encodeURIComponent(id))
export const createAihotSource = (value: SourceDraft) =>
  api<AihotSourceDetail>(base + '/sources', { method: 'POST', body: JSON.stringify(value) })
export const updateAihotSource = (
  id: string,
  value: SourceDraft & { enabled: boolean; version: string },
) =>
  api<AihotSourceDetail>(base + '/sources/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify(value),
  })
export const checkAihotSource = (id: string) =>
  api<{ count: number; elapsedMs: number }>(
    base + '/sources/' + encodeURIComponent(id) + '/check',
    { method: 'POST' },
  )
export const collectAihotSource = (id: string) =>
  api<{ jobId: string | null }>(base + '/sources/' + encodeURIComponent(id) + '/collect', {
    method: 'POST',
  })
export const readingModels = () => api<ReadingModels>(base + '/models')
export const switchReadingModel = (key: string, model: string | null) =>
  api<ReadingModels>(base + '/models/' + encodeURIComponent(key), {
    method: 'PUT',
    body: JSON.stringify({ model }),
  })
export const updateReadingBudget = (
  service: string,
  value: { perMinute: number; perHour: number; perDay: number },
) =>
  api<ReadingModels>(base + '/budgets/' + encodeURIComponent(service), {
    method: 'PUT',
    body: JSON.stringify(value),
  })
