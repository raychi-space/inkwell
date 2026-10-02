import { api } from '../../shared/api/client'
import type { SiteSettings } from './types'

export const getSettings = () => api<SiteSettings>('/api/v1/admin/settings')
export const saveSettings = (value: SiteSettings) =>
  api<SiteSettings>('/api/v1/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(value),
  })
