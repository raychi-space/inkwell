import { api } from '../../shared/api/client'

export type Name = { name: string }

export const categories = () => api<Name[]>('/api/v1/public/categories')
export const tags = () => api<Name[]>('/api/v1/public/tags')
export const addCategory = (name: string) => api<Name>('/api/v1/admin/categories', {
  method: 'POST', body: JSON.stringify({ name }),
})
export const addTag = (name: string) => api<Name>('/api/v1/admin/tags', {
  method: 'POST', body: JSON.stringify({ name }),
})
