import { readApi } from '../../shared/api/readApi'
import { api } from '../../shared/api/client'
import type { Assistant, Provider } from '../../shared/types/ai'
import type {
  AssistantTemplate,
  ReadingSettings,
  ReadingShelf,
  ReadingSource,
  ReadingSourceInput,
} from './types'

const base = '/api/v1/admin/reading'

export const readingShelf = () => readApi<ReadingShelf>(base)
export const saveReadingSettings = (version: number, translationAssistantId: string | null) =>
  api<ReadingSettings>(base + '/settings', {
    method: 'PUT',
    body: JSON.stringify({ version, translationAssistantId }),
  })
export const createReadingSource = (body: ReadingSourceInput) =>
  api<ReadingSource>(base + '/sources', { method: 'POST', body: JSON.stringify(body) })
export const saveReadingSource = (id: string, body: ReadingSourceInput) =>
  api<ReadingSource>(base + '/sources/' + encodeURIComponent(id), {
    method: 'PUT',
    body: JSON.stringify(body),
  })
export const deleteReadingSource = (id: string) =>
  api<void>(base + '/sources/' + encodeURIComponent(id), { method: 'DELETE' })
export const syncReadingSource = (id: string) =>
  api<ReadingSource>(base + '/sources/' + encodeURIComponent(id) + '/sync', { method: 'POST' })

const aiBase = '/api/v1/admin/ai'
export const assistantTemplates = () =>
  readApi<{ items: AssistantTemplate[] }>(aiBase + '/assistant-templates', { ttl: 300_000 }).then(
    (value) => value.items,
  )
export const createAssistantFromTemplate = (
  templateId: string,
  providerId: string,
  model: string,
) =>
  api<Assistant>(
    aiBase + '/assistant-templates/' + encodeURIComponent(templateId) + '/instantiate',
    {
      method: 'POST',
      body: JSON.stringify({ providerId, model }),
    },
  )
export const loadReadingDependencies = () =>
  Promise.all([
    readApi<{ items: Assistant[] }>(aiBase + '/assistants', { ttl: 300_000 }).then(
      (value) => value.items,
    ),
    readApi<{ items: Provider[] }>(aiBase + '/providers', { ttl: 300_000 }).then(
      (value) => value.items,
    ),
    assistantTemplates(),
  ])

export type ReadingIntegration = {
  mode: 'legacy' | 'aihot'
  configured: boolean
  connected: boolean
  legacyActive: boolean
  checkedAt: string | null
  lastSuccessAt: string | null
  updatedAt: string | null
  managementConfigured?: boolean
}
export const readingIntegration = (signal?: AbortSignal) =>
  readApi<ReadingIntegration>(base + '/integration', { signal, ttl: 30_000 })
