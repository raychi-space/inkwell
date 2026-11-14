import { readApi } from '../../shared/api/readApi'
import { api } from '../../shared/api/client'
import type { SiteSettings } from './types'

export const getSettings = (force = false) =>
  readApi<SiteSettings>('/api/v1/admin/settings', { ttl: 300_000, force })
export const saveSettings = (value: SiteSettings) =>
  api<SiteSettings>('/api/v1/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(value),
  })

export const saveAvatar = (file: File, version: number) => {
  const body = new FormData()
  body.set('file', file)
  body.set('version', String(version))
  return api<SiteSettings>('/api/v1/admin/profile/avatar', { method: 'POST', body })
}
