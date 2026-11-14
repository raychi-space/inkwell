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

export type TaxonomyKind = 'categories' | 'tags'
export type TaxonomyItem = {
  name: string
  draftCount: number
  publicCount: number
  trashCount: number
  historyCount: number
  referenceCount: number
  protectedName: boolean
}
export type TaxonomyReference = { id: string; title: string; status: string }
export const managementTaxonomy = (kind: TaxonomyKind) =>
  api<TaxonomyItem[]>(`/api/v1/admin/taxonomy/${kind}`)
export const taxonomyReferences = (kind: TaxonomyKind, name: string) =>
  api<TaxonomyReference[]>(
    `/api/v1/admin/taxonomy/${kind}/references?${new URLSearchParams({ name })}`,
  )
export const renameTaxonomy = (kind: TaxonomyKind, name: string, newName: string) =>
  api<void>(`/api/v1/admin/taxonomy/${kind}`, {
    method: 'PUT',
    body: JSON.stringify({ name, newName }),
  })
export const deleteTaxonomy = (kind: TaxonomyKind, name: string) =>
  api<void>(`/api/v1/admin/taxonomy/${kind}?${new URLSearchParams({ name })}`, { method: 'DELETE' })
