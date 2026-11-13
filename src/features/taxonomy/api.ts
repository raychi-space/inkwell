import { readApi } from '../../shared/api/readApi'
import { api } from '../../shared/api/client'
import type { Name } from './types'

export const categories = () => readApi<Name[]>('/api/v1/public/categories', { ttl: 300_000 })
export const tags = () => readApi<Name[]>('/api/v1/public/tags', { ttl: 300_000 })
export const addCategory = (name: string) =>
  api<Name>('/api/v1/admin/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
export const addTag = (name: string) =>
  api<Name>('/api/v1/admin/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
