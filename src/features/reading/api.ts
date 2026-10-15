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

export const readingShelf = () => api<ReadingShelf>(base)
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
  api<{ items: AssistantTemplate[] }>(aiBase + '/assistant-templates').then((value) => value.items)
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
    api<{ items: Assistant[] }>(aiBase + '/assistants').then((value) => value.items),
    api<{ items: Provider[] }>(aiBase + '/providers').then((value) => value.items),
    assistantTemplates(),
  ])
