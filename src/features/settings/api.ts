import { readApi } from '../../shared/api/readApi'
import { api } from '../../shared/api/client'
import type { SiteSettings } from './types'

export const getSettings = () => readApi<SiteSettings>('/api/v1/admin/settings', { ttl: 300_000 })
export const saveSettings = (value: SiteSettings) =>
  api<SiteSettings>('/api/v1/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(value),
  })
